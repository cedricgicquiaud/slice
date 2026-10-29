/**
 * WAT-200's scenario: an API whose search action says more than its first line,
 * explains its parameters and limits some of them to a list of values. The same
 * file serves the acceptance checklist; tests run from the repository root.
 */
import { readFileSync } from 'node:fs';

export const ORDERS_SPEC = readFileSync('fixtures/uat-orders.yaml', 'utf-8');

/** The search action's description, both lines, as the spec writes it. */
export const SEARCH_ORDERS_DESCRIPTION =
  'Search orders by customer and status.\nUse it before any action on an order, to find the right one.';
