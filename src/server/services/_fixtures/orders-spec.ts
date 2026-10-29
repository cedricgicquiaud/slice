/**
 * WAT-200's scenario: an API whose search action says more than its first line,
 * explains its parameters and limits some of them to a list of values.
 */
export const ORDERS_SPEC = `openapi: 3.0.3
info: { title: Orders, version: "1.0" }
servers: [{ url: http://placeholder }]
paths:
  /orders:
    get:
      operationId: listOrders
      summary: List orders
      responses: { '200': { description: ok } }
  /orders/search:
    post:
      operationId: searchOrders
      summary: Search orders
      description: |-
        Search orders by customer and status.
        Use it before any action on an order, to find the right one.
      parameters:
        - name: customer
          in: query
          description: Customer name, e.g. Sara
          schema: { type: string }
        - name: status
          in: query
          schema: { type: string, enum: [pending, shipped, late] }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                carrier:
                  type: string
                  description: Carrier that ships the order
                  enum: [ups, dhl]
      responses: { '200': { description: ok } }
`;

/** The search action's description, both lines, as the spec writes it. */
export const SEARCH_ORDERS_DESCRIPTION =
  'Search orders by customer and status.\nUse it before any action on an order, to find the right one.';
