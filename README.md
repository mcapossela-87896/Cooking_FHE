# Secret Kitchen: A Competitive Cooking Game 🍳👩‍🍳

Imagine a culinary battlefield where only the sharpest chefs can thrive! Secret Kitchen is a highly interactive, multiplayer cooking game powered by **Zama's Fully Homomorphic Encryption technology (FHE)**. In this game, customer orders are encrypted with FHE, ensuring that sensitive information remains confidential while still challenging you and your team to collaborate efficiently. Prepare to test your culinary skills and teamwork in a chaotic, fun-filled atmosphere!

## The Problem at Hand

In the world of cooking games, communication and trust are paramount. Traditional game mechanics often lead to confusion over orders, resulting in missed ingredients and unhappy customers. Moreover, players need to navigate a plethora of sensitive information amidst the fun, which can detract from the gameplay. This is where Secret Kitchen comes to the rescue, offering a unique solution by incorporating privacy-preserving technology into its core gameplay mechanics.

## FHE: The Secret Ingredient

Secret Kitchen addresses the chaos of cooking orders by leveraging **Zama's Fully Homomorphic Encryption technology**. With FHE, customer orders are encrypted in a way that allows them to remain private until they are decrypted by the chef. Using Zama's open-source libraries, including **Concrete** and the **zama-fhe SDK**, players can share communication without exposing sensitive data, thereby enhancing gameplay without compromising security. The integration of FHE ensures that every order remains safe while challenging players to communicate effectively under pressure.

## Core Features

🔑 **Encrypted Orders**: Customer requests are kept secure with FHE, visible only to the chef.

🤝 **Role Information Isolation**: Each player has specific roles, minimizing confusion and enhancing teamwork.

🎮 **Game-Centric Communication**: Communication becomes a unique challenge, incorporating elements of strategy into the gameplay.

🎉 **Party Gameplay**: Engage in chaotic yet enjoyable cooking battles with friends, making it perfect for parties and gatherings.

## Technology Stack

- **Zama FHE SDK**: The primary tool for implementing fully homomorphic encryption.
- **Node.js**: Back-end JavaScript runtime used to build the server components.
- **Hardhat**: Ethereum development framework to compile and deploy smart contracts.
- **Solidity**: The programming language for writing smart contracts.
  
## Directory Structure

```
SecretKitchen/
├── contracts/
│   └── Cooking_FHE.sol
├── src/
│   ├── gameLogic.js
│   └── communication.js
├── tests/
│   └── gameLogic.test.js
├── package.json
└── README.md
```

## Getting Started: Installation Guide

To set up Secret Kitchen, follow these simple steps:

1. Ensure you have [Node.js](https://nodejs.org/) and [Hardhat](https://hardhat.org/) installed on your machine.
2. Download the project files and navigate to the project directory.
3. Run the following command in your terminal:

   ```bash
   npm install
   ```

   This command will install all necessary dependencies, including the required Zama FHE libraries.

## Build & Run the Game

Once the installation is complete, you can build and run the game with the following commands:

### Compile the Smart Contracts

To compile the contracts, execute:

```bash
npx hardhat compile
```

### Run the Game

After compilation, you can start the game using the following command:

```bash
npx hardhat run scripts/startGame.js
```

### Testing

To ensure everything is functioning properly, execute the tests:

```bash
npx hardhat test
```

## Showcasing the Main Functionality

Here’s a simplified code snippet that demonstrates how orders are encrypted and processed:

```javascript
const { encryptOrder } = require('./encryption');

function submitOrder(orderDetails) {
    // Encrypt the order using FHE
    const encryptedOrder = encryptOrder(orderDetails);
    
    // Send the encrypted order to the kitchen
    kitchen.receiveOrder(encryptedOrder);
    
    console.log('Order submitted successfully!');
}

// Example of submitting an order
const order = {
    customerId: 123,
    items: ['burger', 'fries'],
    specialRequest: 'No onions'
};

submitOrder(order);
```

## Acknowledgements

### Powered by Zama

Special thanks to the Zama team for their pioneering work in enabling confidential blockchain applications through their open-source tools. Their contribution makes projects like Secret Kitchen possible, blending fun with security in innovative ways. We appreciate your ongoing efforts in the field of Fully Homomorphic Encryption!

> Get ready to ignite your culinary skills while safeguarding sensitive information with Secret Kitchen! Happy cooking! 🍽️
