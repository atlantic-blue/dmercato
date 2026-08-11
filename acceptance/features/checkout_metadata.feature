Feature: A cart survives the journey through Stripe

  A customer's cart is handed to Stripe as checkout metadata and read back when Stripe
  reports the payment. The encoder and the decoder used to live in separate Lambda packages
  with no shared definition, so when the encoder moved to chunked keys and the decoder was
  left reading the old single key, both sides passed their own tests and every webhook
  delivery crashed. These scenarios exercise the two halves together, which is the only way
  that class of fault is visible.

  Scenario: A small order arrives intact
    Given a cart containing 2 of "prod_sourdough" at 650
    And a cart containing 1 of "prod_brownie" at 400
    When the cart is encoded for Stripe and read back
    Then the recovered cart matches the original

  Scenario: A full menu arrives intact
    Given a cart of the vendor's full 14 item menu
    When the cart is encoded for Stripe and read back
    Then the recovered cart matches the original
    And the encoding is spread across more than one metadata value

  Scenario: Nothing sent to Stripe exceeds what Stripe accepts
    Given a cart of the vendor's full 14 item menu
    When the cart is encoded for Stripe
    Then no metadata value exceeds 500 characters

  Scenario: An empty cart does not claim to hold items
    Given an empty cart
    When the cart is encoded for Stripe and read back
    Then the recovered cart is empty

  Scenario: A cart that lost a chunk in transit is refused rather than half read
    Given metadata declaring 2 chunks but carrying only the first
    When the cart is read back
    Then reading fails rather than returning a partial cart
