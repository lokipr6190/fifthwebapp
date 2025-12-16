// index.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// --- LOGGING CONFIGURATION ---

// Define the root persistent directory path (MUST match the volume mount in your Deployment)
const LOG_ROOT_DIR = '/app/data/logs'; 

// Function to get the current date in YYYY-MM-DD format
function getDailyLogPath() {
    const now = new Date();
    // Use ISO string and take the first 10 characters (YYYY-MM-DD)
    const dateString = now.toISOString().substring(0, 10); 
    return path.join(LOG_ROOT_DIR, `${dateString}.log`);
}

// Custom logging function to write to the console (stdout) and the persistent file
function logToFile(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    
    // Get the dynamic log file path for today
    const currentLogPath = getDailyLogPath();

    // 1. Append the log entry to the daily persistent file asynchronously
    fs.appendFile(currentLogPath, logEntry, (err) => {
        if (err) {
            // Log to console if writing to the persistent file fails
            console.error(`ERROR: Failed to write to persistent log file: ${err}`);
        }
    });

    // 2. Write to console (stdout) so 'oc logs' still works for real-time monitoring
    console.log(logEntry.trim());
}

// Ensure the root log directory exists before starting
if (!fs.existsSync(LOG_ROOT_DIR)) {
  try {
    // Recursive: true creates intermediate directories if they don't exist
    fs.mkdirSync(LOG_ROOT_DIR, { recursive: true });
    logToFile('SETUP', `Created persistent root log directory: ${LOG_ROOT_DIR}`);
  } catch (error) {
    console.error(`FATAL ERROR: Could not create directory ${LOG_ROOT_DIR}: ${error}`);
    // You might want to exit here if persistent logging is critical
  }
}

// --- EXPRESS ROUTE ---

app.get('/' , (req,res) => {
    const message = `GET request received from ${req.ip || 'unknown'} for path: ${req.path}`;
    
    // Log the request
    logToFile('INFO', message); 

    res.send('Hello World! Request details logged persistently to a daily file.');
});


// --- SERVER START ---

// Use environment variables for flexibility in OpenShift
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen (PORT, HOST, () => {
    logToFile('INFO', `Server successfully started and listening on ${HOST}:${PORT}`);
});