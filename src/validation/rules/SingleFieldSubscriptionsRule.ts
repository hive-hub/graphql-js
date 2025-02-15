import type { ObjMap } from '../../jsutils/ObjMap.js';

import { GraphQLError } from '../../error/GraphQLError.js';

import type {
  FragmentDefinitionNode,
  OperationDefinitionNode,
} from '../../language/ast.js';
import { Kind } from '../../language/kinds.js';
import type { ASTVisitor } from '../../language/visitor.js';

import { collectFields } from '../../execution/collectFields.js';

import type { ValidationContext } from '../ValidationContext.js';

/**
 * Subscriptions must only include a non-introspection field.
 *
 * A GraphQL subscription is valid only if it contains a single root field and
 * that root field is not an introspection field.
 *
 * See https://spec.graphql.org/draft/#sec-Single-root-field
 */
export function SingleFieldSubscriptionsRule(
  context: ValidationContext,
): ASTVisitor {
  return {
    OperationDefinition(node: OperationDefinitionNode) {
      if (node.operation === 'subscription') {
        const schema = context.getSchema();
        const subscriptionType = schema.getSubscriptionType();
        if (subscriptionType) {
          const operationName = node.name ? node.name.value : null;
          const variableValues: {
            [variable: string]: any;
          } = Object.create(null);
          const document = context.getDocument();
          const fragments: ObjMap<FragmentDefinitionNode> = Object.create(null);
          for (const definition of document.definitions) {
            if (definition.kind === Kind.FRAGMENT_DEFINITION) {
              fragments[definition.name.value] = definition;
            }
          }
          const { fields } = collectFields(
            schema,
            fragments,
            variableValues,
            subscriptionType,
            node,
          );
          if (fields.size > 1) {
            const fieldSelectionLists = [...fields.values()];
            const extraFieldSelectionLists = fieldSelectionLists.slice(1);
            const extraFieldSelections = extraFieldSelectionLists.flat();
            context.reportError(
              new GraphQLError(
                operationName != null
                  ? `Subscription "${operationName}" must select only one top level field.`
                  : 'Anonymous Subscription must select only one top level field.',
                { nodes: extraFieldSelections },
              ),
            );
          }
          for (const fieldNodes of fields.values()) {
            const fieldName = fieldNodes[0].name.value;
            if (fieldName.startsWith('__')) {
              context.reportError(
                new GraphQLError(
                  operationName != null
                    ? `Subscription "${operationName}" must not select an introspection top level field.`
                    : 'Anonymous Subscription must not select an introspection top level field.',
                  { nodes: fieldNodes },
                ),
              );
            }
          }
        }
      }
    },
  };
}
