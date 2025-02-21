import { graphqlHTTP } from 'express-graphql';
import {
  GraphQLID,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} from 'graphql';
import DataLoader from 'dataloader';
import pluralize from 'pluralize';
import { ResolverContextInput } from './resolvers';

/**
 * Creates getLoader function that will return existing, or create a new dataloader
 * for specific entity.
 * createGetLoader should be called per-request so each request has its own caching
 * and batching.
 */
export const createGetLoader = (context: ResolverContextInput) => {
  const loaders = {};

  return (name: string) => {
    if (!loaders[name]) {
      loaders[name] = new DataLoader(async ids => {
        const query = `SELECT * FROM ${pluralize(name)} WHERE id in (?)`;

        context.log.debug({ sql: query, ids }, 'executing batched query');

        const results = await context.mysql.queryAsync(query, [ids]);
        const resultsMap = Object.fromEntries(results.map(result => [result.id, result]));

        return ids.map((id: any) => resultsMap[id] || new Error(`Row not found: ${id}`));
      });
    }

    return loaders[name];
  };
};

/**
 * Creates an graphql http handler for the query passed a parameters.
 * Returned middleware can be used with express.
 */
export default function get(
  schema: GraphQLSchema,
  context: ResolverContextInput,
  sampleQuery?: string
) {
  return graphqlHTTP(() => ({
    schema,
    context: {
      ...context,
      getLoader: createGetLoader(context)
    },
    graphiql: {
      defaultQuery: sampleQuery
    }
  }));
}

/**
 * This objects name and field maps to the values of the _metadata
 * database store
 *
 */
export const MetadataGraphQLObject = new GraphQLObjectType({
  name: '_Metadata',
  description: 'Core metadata values used internally by Checkpoint',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID), description: 'example: last_indexed_block' },
    value: { type: GraphQLString }
  }
});

/**
 * This objects name and field maps to the values of the _checkpoints
 * database store. And is used to generate entity queries for graphql
 *
 */
export const CheckpointsGraphQLObject = new GraphQLObjectType({
  name: '_Checkpoint',
  description: 'Contract and Block where its event is found.',
  fields: {
    id: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'id computed as last 5 bytes of sha256(contract+block)'
    },
    block_number: {
      type: new GraphQLNonNull(GraphQLInt)
    },
    contract_address: {
      type: new GraphQLNonNull(GraphQLString)
    }
  }
});
