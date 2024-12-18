
const fs = require('fs');
const ethers = require('ethers'); // Import ethers
require("dotenv").config();
const { Interface } = require('ethers');
const { AlchemyProvider } = require('ethers');
const OpenAI = require("openai");
const OpenAI_KEY = '';
const openai = new OpenAI({
  apiKey: OpenAI_KEY, // Replace with your actual API key
});
const { Network, Alchemy } = require("alchemy-sdk");
//const { Alchemy, Network, AlchemySubscription } = require("alchemy-sdk");
const settings = {
    apiKey: '',  // Your Alchemy API Key
    network: Network.ETH_SEPOLIA,  // Sepolia Test Network,  // Can be replaced with other networks like ETH_GOERLI, etc.
};
const alchemy = new Alchemy(settings);
const wsProvider = alchemy.ws;
let rpcProvider;
let contractInterface;
let vectorStoreId;
let assistantId;
let SMART_CONTRACT_ABI;
let provider;
let thread;
let allTransactionsfilePath;
let newfilePath;//for updated events and transactions
const ETHERSCAN_API_KEY = '';
const contractAddress = "0x67bF6d7ecAa9F406D64C318EeD74c56E993e3bfb"; 

//0x67bF6d7ecAa9F406D64C318EeD74c56E993e3bfb my SC address

async function getContractABI() {
  const url = `https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "1") {
      const abi = JSON.parse(data.result);
      console.log("Contract ABI:", abi);
      return abi; // Store the ABI in a variable
    } else {
      console.error("Error fetching ABI:", data.result);
      return null; // Return null if there's an error
    }
  } catch (error) {
    console.error("Error making request:", error);
    return null; // Return null in case of a request error
  }
}

//add listener to the events in the blockchain
async function listenToEvents(){

//alchemy.ws.on(contract.filters.Event("newBatteryAddedByUser"), (log, event) => console.log(log, event))
console.log("inside Listen to Events:");     


rpcProvider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/'YOUR KEY'");

const contract = new ethers.Contract(contractAddress, SMART_CONTRACT_ABI, rpcProvider);

// contract.on("newBatteryAddedByUser", async (id, owner, event) => {
//         let newBatteryEvent = {
//             id: id.toString(),  // Convert id to string if needed
//             owner: owner,       // The address of the owner
//             eventData: event,   // The full event data            
//           };
//        console.log("newBatteryAddedByUser Event:",newBatteryEvent);
//     });

    // Set up a generic listener to capture all events
    contract.on("*", async (...args) => {
      const event = args[args.length - 1]; // Get the event object from the last argument
      const tx = event.log.transactionHash;
      // Log the event name, transaction hash, and arguments
      console.log("Event transaction:", tx);
      console.log("Event: ");
      //console.log(stringifyWithBigInt(event));
      await getTransactionDetails(tx, event);
      
      
  });

}

// Function to retrieve transaction details using the transaction hash
async function getTransactionDetails(txHash, event) {
  let logData = {};
  try {
      const transaction = await rpcProvider.getTransaction(txHash);
      //console.log(JSON.stringify(transaction, null, 2));
      let functionSelector = null;
      let decodedInput = null;
      if (transaction) {
          console.log("Transaction Details:");
          console.log(`Hash: ${transaction.hash}`);
          console.log(`From: ${transaction.from}`);
          console.log(`To: ${transaction.to}`);
          console.log(`Value: ${ethers.formatEther(transaction.value)} ETH`);
          console.log(`Gas Price: ${ethers.formatUnits(transaction.gasPrice, "gwei")} Gwei`);
          console.log(`Block Number: ${transaction.blockNumber}`);
          console.log(`Nonce: ${transaction.nonce}`);
         
            // Prepare log data
      logData.transactionHash = transaction.hash;
      logData.from = transaction.from;
      logData.to = transaction.to;
      logData.value = `${ethers.formatEther(transaction.value)} ETH`;
      logData.gasPrice = `${ethers.formatUnits(transaction.gasPrice, "gwei")} Gwei`;
      logData.blockNumber = transaction.blockNumber;
      logData.nonce = transaction.nonce;
      const block = await rpcProvider.getBlock(transaction.blockNumber);
      const transactionTimestamp = block.timestamp;
      logData.timestamp = new Date(transactionTimestamp * 1000).toISOString();
             // Decode the input data
           try{
             const decodedData = contractInterface.parseTransaction({ data: transaction.data, value: transaction.value });
             
             console.log("Decoded Input Data:");
             console.log(`Function Name: ${decodedData.name}`);
             console.log("input:");
             console.log(decodedData.args);
             //console.log(`Function Signature: ${decodedData.data.slice(0, 10)}`); // First 10 characters for function signature (0x + 4 bytes)
             const displayResult = decodedData.args.map(item => item.toString());
             console.log(displayResult);

              // Add decoded data to log
        logData.functionName = decodedData.name;
        //logData.functionSignature = decodedData.data.slice(0, 10);
        logData.input = displayResult;
        // Add event arguments to log data
        logData.eventName = event.event; // Add event name
        logData.eventArguments = event.args.map(arg => arg.toString()); // Add event arguments

         // Define the file path using the transaction hash
         newfilePath = `C:\\Users\\100045845.KUNET\\Documents\\EV Batteries LLM\\EVbatteryLLM\\${transaction.hash}.json`;
// Write data to file
const logString = JSON.stringify(logData, (key, value) => {
  // Handle BigInt serialization
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}, 2);

await fs.writeFileSync(newfilePath, logString);
await addFileToVectorStore(newfilePath);
console.log(`Transaction details written to ${newfilePath} and to vector store`);

            } catch (error) {
             
                console.error("Error decoding input or writing to file: ", error);
              }
            
      } else {
          console.log("Transaction not found.");
      }
  } catch (error) {
      console.error("Error fetching transaction:", error);
  }
}


async function getTransactions(allTransactionsfilePath) {    
  
    try {
      // Initialize provider
      provider = new AlchemyProvider("sepolia", "ekc2BWwDRZh2eAa7zL8jPcbBmiBhawgL"); 
      if (!provider) {
        throw new Error("Failed to initialize provider");
      }
    } catch (error) {
      console.log("Error initializing provider: ", error);
      return; // Exit if provider initialization fails
    }
  
     contractInterface = new Interface(SMART_CONTRACT_ABI);
    const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
  
    //https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=0x7145583bBc28c63b495AeA3A3B618537840BadA0&startblock=0&endblock=99999999&sort=asc&apikey=CZYUP8JEP995MWQ65X8PJJRRA675KUPD8P

    try {
      const response = await fetch(url);
      const data = await response.json();
  
      if (data.status === '1') {
        const transactions = data.result;
  
        const transactionData = await Promise.all(transactions.map(async (tx) => {
          let parsedLog = null;
          let decodedLog = [];
          let functionSelector = null;
          let decodedInput = null;
          let receipt;

          // Check if the transaction is a contract creation (constructor call)
          if (!tx.to) {
            console.log("This transaction is a contract creation, likely calling the constructor.");
            // You can log the input or handle constructor data differently if needed
          } else {
            const inputData = tx.input;
            // The first 4 bytes of the input data are the function selector
            functionSelector = inputData.slice(0, 10);
            try {
              // Decode the input using the function selector and full input data
              decodedInput = contractInterface.decodeFunctionData(functionSelector, inputData);
              console.log("Decoded Input: ", decodedInput);
            } catch (error) {
              if (error.code === 'INVALID_ARGUMENT') {
                console.warn(`Unknown function for selector ${functionSelector}:`, error);
              } else {
                console.error("Error decoding input: ", error);
              }
            }
          
  
          try {
            // Get the transaction receipt (logs for each transation)
            receipt = await provider.getTransactionReceipt(tx.hash);
            if (!receipt) {
              throw new Error(`Transaction receipt not found for tx.hash: ${tx.hash}`);
            }
          } catch (error) {
            console.error(`Error fetching transaction receipt for ${tx.hash}:`, error);
            return; // Skip this transaction if receipt fetch fails
          }
  
          // Attempt to decode the logs
          try {
            // Decode logs
            for (const log of receipt.logs) {
              try {
                parsedLog = contractInterface.parseLog(log);
                decodedLog.push(parsedLog);
              } catch (error) {
                console.warn(`Log decoding error for transaction ${tx.hash}:`, error);
              }
            }
          
          } catch (error) {
            console.error(`Error decoding log for transaction ${tx.hash}:`, error);
          }
        }
         

          return {
            functionName: tx.functionName,
            transactionHash: tx.hash,
            input:decodedInput,
            event: decodedLog,
            timestamp: new Date(tx.timeStamp * 1000).toISOString(),
          };
        }));
  
        // Write the transaction data to a JSON file
        const jsonData = JSON.stringify(transactionData, (key, value) => {
          return typeof value === 'bigint' ? value.toString() : value;
        }, 2);
        
        try {
          fs.writeFileSync(allTransactionsfilePath, jsonData);
          console.log('Data has been written to', allTransactionsfilePath);
        } catch (error) {
          console.error('Error writing to file:', error);
        }
      } else {
        console.error('Error:', data.message);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    }
  }




async function createAssistant() {
 try{
  const myAssistant = await openai.beta.assistants.create({
    instructions:
      "You will help users to buy second hand EV batteries based on their requirements. Make sure your answers are in written paragraphs using sentences. Do not include citations or annocations. You will provide them with a summary of the owners, accidents involved if any, State of Health, milage and any other needed information such as warranty if any or certifications. You need to get the information from the events and the logs in the data set to help the users get quick answers. The structure of the EV battery includes uint id, uint price in Ether, address owner, uint currentSOH, bytes32 SOHreportHash, uint256 lastSoHupdate which is a timestamp,string batteryModelChemistry, string manufacturer,  uint256 manufactureDate,  uint initialCapacity which is in (kWh) The battery’s original capacity when it was first produced, uint cycleCount, uint currentCapacity measured in (kWh), uint currentMilage which is given by the last owner, bytes32 maintenanceRecords which is an ipfs hash, uint sustainabilityScore",
    name: "EV Battery",
    tools: [{ type: "file_search" }],
    model: "gpt-4o-mini",
    
  });
  assistantId = myAssistant.id;
  console.log('assistant created' ,assistantId);
} catch (error) {
  console.error("Error creating assistant:", error);
}
}


// Function to create a thread 
async function createThread() {
  try {
    // Define previous messages for context (if any)
    const previousMessages = [
      { role: 'user', content: 'What are the benefits of EV batteries?' },
      { role: 'assistant', content: 'EV batteries are eco-friendly and efficient.' },
      // Add more previous messages as needed
    ];

    console.log("inside; the create thread");
    thread = await openai.beta.threads.create();

  } catch (error) {
    console.error('Error creating thread:', error);
  }
}


// Function to send a user message to the thread
// Function to send a user message to the thread
async function sendMessageToThread(userMessage) {
  try {
    const response = await openai.beta.threads.messages.create(
      thread.id, // Use thread ID
      { role: "user", content: userMessage } // User message
    );

    console.log('Message sent to thread:', response); // Log the response data
    return response; // Return the response for further use
  } catch (error) {
    console.error('Error sending message to thread:', error);
  }
}

// Run thread with the assistant ID
async function runThread() {
  try {
    // Run the thread and wait for the response
    const run = await openai.beta.threads.runs.createAndPoll(
      thread.id, // Use thread ID
      { 
        assistant_id: assistantId, // Your assistant ID
        instructions: "Please provide the response as HTML. If you use lists or bullets, make sure each item is in a new line. Make sure your answers are in written paragraphs using sentences. Do not include citations or annocations. You will provide them with a summary of the owners, accidents involved if any, State of Health, milage and any other needed information such as warranty if any or certifications. You need to get the information from the events and the logs as well as the function inputs and signature in the data set to help the users get quick answers. The structure of the EV battery includes uint id, uint price in Ether, address owner, uint currentSOH, bytes32 SOHreportHash, uint256 lastSoHupdate which is a timestamp,string batteryModelChemistry, string manufacturer,  uint256 manufactureDate,  uint initialCapacity which is in (kWh) The battery’s original capacity when it was first produced, uint cycleCount, uint currentCapacity measured in (kWh), uint currentMilage which is given by the last owner, bytes32 maintenanceRecords which is an ipfs hash, uint sustainabilityScore. Provide the battery details as a continuous paragraph with each battery ID in bold and a new line before each battery details then a summary is provided as a bordered table with all full borders around each cell, each row a battery with the following columns: ID, Price, Owner, Current SOH, Battery Model Chemistry, Manufacturer, Manufacture Date, Initial Capacity, Cycle Count, Current Capacity, Current Mileage, Sustainability Score. Without wrapping the response in ```html or any code block syntax. The warranty terms if available must be written as a continuous paragraph without html and quotations. Do not include any annotations or citations. You need to keep being up to date with any news files added. Warranties can get added to existing batteries or new batteries can get added. Keep reading in new files before answering. You will be asked about the state of health (SOH), you can provide warranty details and battery chemistry, maintenance records.",
        //response_format: { type: "json_object" }
      }
    );

    console.log('Run response:', run); // Log the full response

    // Check if the run is completed
    if (run.status === 'completed') {
      // List messages in the thread
      const messages = await openai.beta.threads.messages.list(run.thread_id);
      let assistantResponse = '';
      console.log("Full Messages Object without reverse:", JSON.stringify(messages, null, 2));
      assistantResponse = messages.body.data[0].content[0].text.value; // Capture assistant's response
      console.log("Full messages with Reverse: ",messages.data.reverse());
      //only needed to print all the messages of the thread conversation 
      //from the beginning according to their time order
      // // Log messages
      // for (const message of messages.data.reverse()) {
      //   console.log(`${message.role} > ${message.content[0].text.value}`);
      //   if (message.role === 'assistant') {
      //     assistantResponse = message.content[0].text.value; // Capture assistant's response
      //   }
      // }
       
      
      return assistantResponse; // Return the assistant's response
    } else {
      console.log(run.status);
    }
  } catch (error) {
    console.error('Error running thread:', error);
  }
}


async function createVectorStore(storeName) {
  try {
    // Step 2: Create the vector store for the assistant
    const vectorStore = await openai.beta.vectorStores.create({
      name: storeName,  // Name your vector store
    });

    console.log('Vector Store Created:', vectorStore.id);
    vectorStoreId = vectorStore.id;
    return vectorStore.id; // Return the vector store ID for further use
  } catch (error) {
    console.error('Error creating vector store:', error);
  }
}

//this fucntion returns the file ID after uploading it to OPEN AI
async function uploadFileToOpenAI(passedPath) {

  try {
    // Check if the file exists
    if (!fs.existsSync(passedPath)) {
      throw new Error(`File not found: ${passedPath}`);
  }

    // Create a readable stream from the file
    const fileStream = fs.createReadStream(passedPath);

    // Upload the file to OpenAI
    const response = await openai.files.create({
      file: fileStream,
      purpose: "assistants", // Specify purpose if needed, e.g., "assistants"
    });

    console.log("File uploaded successfully:", response.id);
    
    // Return the file ID for further use
    return response.id;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error; // Optionally re-throw the error for further handling
  }
}


async function addFileToVectorStore(pathTofile) {
  
  try {
    const fileID = await uploadFileToOpenAI(pathTofile);
    const response = await openai.beta.vectorStores.files.create(vectorStoreId, {
      file_id: fileID,
    });
    console.log("File added to vector store:", response);
  } catch (error) {
    console.error("Error adding file to vector store:", error);
  }
}

async function updateAssistantWithVectorStore() {
  
  try {
    await openai.beta.assistants.update(assistantId, {
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStoreId],
        },
      },
    });
    console.log("Assistant updated with vector store ID:", vectorStoreId);
  } catch (error) {
    console.error("Error updating assistant with vector store ID:", error);
  }
}


// Server Side
const express = require('express');
const path = require('path'); // Require path before using it
const app = express();
const port = 3000;

// This is for parsing JSON bodies in requests
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the HTML file
app.get('/webInterface.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'webInterface.html'));
});


// Sample route to handle the POST request from the HTML form
app.post('/ask-assistant', async (req, res) => {
  const userMessage = req.body.message;

  try {
      // Check if thread exists, if not, initialize it
      if (!thread) {
          await initializeThread(); // Create a new thread if it doesn't exist
      }

      // Send the user message to the thread
      await sendMessageToThread(userMessage);

      // Run the thread and wait for the response
      const assistantResponse = await runThread();

      
      // Send the assistant's response back to the client
      res.json({ reply: assistantResponse }); // Assuming assistantResponse contains the reply
  } catch (error) {
      console.error('Error processing assistant request:', error);
      res.status(500).json({ reply: 'An error occurred while processing your request.' });
  }
});

// 



async function main() {
  try {
    // Wait for the contract ABI to be fetched
    SMART_CONTRACT_ABI = await getContractABI();
    allTransactionsfilePath = 'C:\\Users\\100045845.KUNET\\Documents\\EV Batteries LLM\\EVbatteryLLM\\transactions.json';
    // Ensure each async function is awaited properly
    await getTransactions(allTransactionsfilePath); // Assuming this function is async
    await createAssistant();  // Assuming this function is async
    await createVectorStore("EV battery file store"); // Assuming this is async
     
    await addFileToVectorStore(allTransactionsfilePath); // Assuming this is async
    // Update assistant with the vector store, now awaited
    await updateAssistantWithVectorStore(); 
    await createThread();
    await listenToEvents().catch((error) => {
      console.error("Error listening to events:", error);
    });
    console.log("Main function execution completed.");
    
  } catch (error) {
    console.error("Error in main function:", error);
  }

}


// Call the main function first
main().then(() => {
  // Start the server only after the main function completes
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});

