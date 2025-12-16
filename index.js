// index.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron'); // New dependency

const app = express();

// --- CONFIGURATION ---

// Define persistent directory paths (MUST match the volume mount)
const LOG_ROOT_DIR = '/app/data/logs'; 
const ARCHIVE_DIR = path.join(LOG_ROOT_DIR, 'archive'); // New archive folder

// Time constants in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const SIX_MONTHS_MS = 183 * ONE_DAY_MS; // Approximation for 6 months

// --- CORE UTILITY FUNCTIONS ---

// Function to get the current date in YYYY-MM-DD format for log file naming
function getDailyLogPath() {
    const now = new Date();
    const dateString = now.toISOString().substring(0, 10); 
    return path.join(LOG_ROOT_DIR, `${dateString}.log`);
}

// Custom logging function to write to the console (stdout) and the persistent file
function logToFile(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    
    const currentLogPath = getDailyLogPath();

    fs.appendFile(currentLogPath, logEntry, (err) => {
        if (err) {
            console.error(`ERROR: Failed to write to persistent log file: ${err}`);
        }
    });
    
    console.log(logEntry.trim());
}

// --- LOG MAINTENANCE FUNCTION (NEW) ---

function runLogMaintenance() {
    logToFile('MAINTENANCE', 'Starting daily log maintenance...');
    const now = Date.now();

    // Helper function to process a directory for movement or deletion
    function processDirectory(dirPath, maxAgeMs, isPurge) {
        fs.readdir(dirPath, (err, files) => {
            if (err) return logToFile('ERROR', `Failed to read directory ${dirPath}: ${err}`);

            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                
                // Skip directories (like 'archive' if processing LOG_ROOT_DIR)
                if (fs.statSync(filePath).isDirectory()) return;

                fs.stat(filePath, (err, stats) => {
                    if (err) return logToFile('ERROR', `Failed to stat file ${filePath}: ${err}`);

                    const fileAge = now - stats.mtimeMs; // Use modification time
                    
                    if (fileAge > maxAgeMs) {
                        if (isPurge) {
                            // PURGE: Delete file older than maxAgeMs
                            fs.unlink(filePath, (err) => {
                                if (err) logToFile('ERROR', `Failed to delete old log: ${filePath}`);
                                else logToFile('MAINTENANCE', `PURGED log file older than ${maxAgeMs/ONE_DAY_MS} days: ${file}`);
                            });
                        } else {
                            // ARCHIVE: Move file older than maxAgeMs to archive folder
                            const destPath = path.join(ARCHIVE_DIR, file);
                            fs.rename(filePath, destPath, (err) => {
                                if (err) logToFile('ERROR', `Failed to move log to archive: ${filePath}`);
                                else logToFile('MAINTENANCE', `ARCHIVED log file older than ${maxAgeMs/ONE_DAY_MS} days: ${file}`);
                            });
                        }
                    }
                });
            });
        });
    }

    // 1. Archive logs older than 7 days (from LOG_ROOT_DIR to ARCHIVE_DIR)
    processDirectory(LOG_ROOT_DIR, SEVEN_DAYS_MS, false);

    // 2. Purge archived logs older than 6 months (from ARCHIVE_DIR)
    processDirectory(ARCHIVE_DIR, SIX_MONTHS_MS, true);
    
    logToFile('MAINTENANCE', 'Log maintenance finished.');
}


// --- INITIAL SETUP AND START ---

// Function to ensure directories exist (including the new archive folder)
function initializeDirectories() {
    if (!fs.existsSync(LOG_ROOT_DIR)) {
      fs.mkdirSync(LOG_ROOT_DIR, { recursive: true });
      logToFile('SETUP', `Created persistent root log directory: ${LOG_ROOT_DIR}`);
    }
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      logToFile('SETUP', `Created persistent archive log directory: ${ARCHIVE_DIR}`);
    }
}

// Ensure both log directories exist before proceeding
initializeDirectories();

// Schedule the maintenance job to run once a day at midnight (00:00)
// Cron expression: minute hour day-of-month month day-of-week
cron.schedule('0 0 * * *', runLogMaintenance, {
    scheduled: true,
    timezone: "Etc/UTC" // Use a consistent timezone
});
logToFile('SETUP', 'Log maintenance job scheduled to run daily at midnight UTC.');


// --- EXPRESS ROUTE ---

app.get('/' , (req,res) => {
    const message = `GET request received from ${req.ip || 'unknown'} for path: ${req.path}`;
    
    logToFile('INFO', message); 

    res.send('Hello World! Request details logged persistently, and log maintenance is scheduled.');
});


// --- SERVER START ---

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen (PORT, HOST, () => {
    logToFile('INFO', `Server successfully started and listening on ${HOST}:${PORT}`);
});
