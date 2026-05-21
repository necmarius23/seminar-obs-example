# Agent Skills Guide for the Shop App

This guide explains what agent skills are, how to design them well, and how to build a small skill for the `obs-example` shop application.

This content is inspired by the agent skills concepts from `agentskills.io` and the Claude agent skills best practices guide.

- https://agentskills.io/home
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

## 1. What Is an Agent Skill?

An agent skill is a discrete capability that an intelligent agent can choose to use when it wants to accomplish a task. Skills are usually defined with:

- A clear name and description
- A list of inputs and their types
- A predictable, safe output format
- A narrow purpose

A skill is not the agent itself. It is a tool the agent can call when a user asks for something relevant.

## 2. Why Skills Matter

Good skills make an agent:

- easier to maintain
- easier to test
- less likely to hallucinate
- better at delegating exactly the right work

For example, instead of letting the agent parse a shopping cart request free-form, a skill can expose a structured operation such as `add_item_to_cart(productId, quantity)`.

## 3. Skill Design Best Practices

### 3.1 Keep skills narrow and focused

Each skill should do one thing well. Avoid skills that try to do too much.

Example:

- Good: `query_product_details(productId)`
- Bad: `manage_cart_and_checkout_with_fallbacks`

### 3.2 Use explicit schemas and validation

Define exactly what parameters the skill expects and what each parameter means. Validate that inputs are present and in the right format before the skill executes.

Example schema fields:

- `userId` — string
- `productId` — integer
- `quantity` — integer > 0

### 3.3 Treat the skill as a tool, not a conversation partner

The agent should call the skill with structured data and then decide what to say to the user based on the skill result. The skill itself should not try to summarize or reason beyond its domain.

### 3.4 Keep the agent in control of user intent

The skill should not guess user intent outside its scope. If a user asks for something the skill does not support, the skill should return a clear error or request a more specific command.

## 4. Agent Skill Pattern for This Repo

The `obs-example` shop app has several useful operations that can be exposed as skills:

- `get_catalog` — list products available for purchase
- `search_products(query, category)` — discover products by keyword or category
- `get_cart(userId)` — review the current cart
- `add_to_cart(userId, productId, quantity)` — add an item to a user's cart
- `checkout(userId)` — place an order

A well-designed skill layer here could let an agent help a user shop, compare products, and complete checkout safely.

## 5. Example Skill: `shopAssistant`

This guide proposes a skill called `shopAssistant`.

### Purpose

Help an agent guide a shopper through browsing, selecting, and purchasing products.

### Inputs

- `userId` (string)
- `action` (enum: `browse_catalog`, `view_product`, `add_to_cart`, `checkout`)
- `productId` (optional integer)
- `quantity` (optional integer)
- `query` (optional string)

### Suggested Behavior

- If `action=browse_catalog`, return a list of available products and categories.
- If `action=view_product`, return product details for the requested `productId`.
- If `action=add_to_cart`, add the requested product to the user's cart and return the updated cart.
- If `action=checkout`, attempt checkout and return a result summary.

### Output

A structured JSON object with fields such as:

- `status` — `success` or `error`
- `message` — human-friendly summary
- `data` — payload specific to the action
- `cart` — current cart contents when relevant
- `orderId` — on successful checkout
- `recommendation` — optional suggestion for next steps

### Why this is a good skill

- It maps directly to the app's shopping flows
- It keeps the agent from making unsafe updates
- It supports clear shopper-facing responses
- It gives the agent a structured way to guide the user through purchase steps

## 6. Aligning Skills with Shopping Flows

A good skill should match the way a shopper interacts with the app.

- Expose catalog browsing, product details, cart review, and checkout as separate operations.
- Keep the output easy for the agent to translate into a response like "I found this product" or "Your cart contains 2 items."
- Avoid complex multi-step behavior inside the skill; let the agent orchestrate the flow.

## 7. Exercise: Build a Skill for the Shop App

### Goal
Create a new skill that helps an agent support a shopper using the app.

### Exercise steps

1. Read this guide and choose one of these shopping tasks:
   - `browse_catalog()`
   - `search_products(query)`
   - `view_product(productId)`
   - `add_to_cart(userId, productId, quantity)`
   - `checkout(userId)`
2. Design a skill interface with clear input fields and a structured JSON response.
3. Implement the skill as a backend wrapper or service layer that calls the existing REST endpoints:
   - `GET /api/products`
   - `GET /api/products/{id}`
   - `GET /api/cart/{userId}`
   - `POST /api/cart/{userId}/items`
   - `POST /api/orders/checkout`
4. Make the skill return a structured response that contains the action result and any next-step suggestion.

### Example task

Build a skill called `shoppingAssistant(userId)` that supports these actions:

- `action=browse_catalog` — returns a list of popular products and categories.
- `action=view_product` — returns product details and availability.
- `action=add_to_cart` — adds a product to the cart and returns the updated cart summary.
- `action=checkout` — attempts checkout and returns a purchase summary.

If checkout succeeds, return:
- `status: success`
- `orderId`
- `totalAmount`
- `message`

If checkout fails, return:
- `status: error`
- `message`
- `cartSummary`
- `suggestedNextStep`

### Shopper-focused extension

Once the skill is implemented, verify that:

- it can guide a user from product discovery to checkout
- it produces clear structured results the agent can use to respond
- it avoids doing unrelated admin or diagnostics work

## 8. Bonus: Use a Skill Creator Workflow

If you want to formalize the skill design, use the Anthropics `skill-creator` approach:

- https://github.com/anthropics/skills/blob/main/skills/skill-creator

This bonus workflow helps you define the skill schema, inputs, outputs, and safe behavior before writing the implementation.

## 9. Practical Agent Skill Checklist

When you build a skill for this repo, ask yourself:

- Is the skill purpose narrow and clear?
- Does the skill accept only the data it needs?
- Is the response format structured and easy for the agent to parse?
- Does it avoid open-ended operations or assumptions?

## 9. Conclusion

Agent skills are a way to make agents safer and more reliable. In this shop app, a skill layer can bridge the gap between user intent and backend actions while preserving traceability and observability.

If you want to extend this further, consider adding a second skill for `catalog_inspector` or `checkout_auditor` that returns both business data and the relevant telemetry context for the agent.

## References

- `agentskills.io` — https://agentskills.io/home
- `Claude agent skills best practices` — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- `Anthropics skill-creator` — https://github.com/anthropics/skills/blob/main/skills/skill-creator
