/**
 * Script to automatically replace console.log with logger
 * Run: node src/scripts/replace-console-logs.js
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Directories to process
const directoriesToProcess = [
  'src/routes',
  'src/middleware',
  'src/utils',
];

// Files to skip
const filesToSkip = [
  'logger.js', // Don't modify the logger itself
  'replace-console-logs.js', // Don't modify this script
];

let totalFiles = 0;
let totalReplacements = 0;
let filesModified = 0;

/**
 * Check if file should be processed
 */
function shouldProcessFile(filePath) {
  const fileName = path.basename(filePath);
  
  // Skip if in skip list
  if (filesToSkip.includes(fileName)) {
    return false;
  }
  
  // Only process .js files
  if (!fileName.endsWith('.js')) {
    return false;
  }
  
  return true;
}

/**
 * Add logger import if not exists
 */
function ensureLoggerImport(content, filePath) {
  // Check if logger is already imported
  if (content.includes("require('../utils/logger')") || 
      content.includes("require('./utils/logger')") ||
      content.includes("require('../../utils/logger')")) {
    return content;
  }
  
  // Determine correct path to logger
  const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '../utils'));
  const loggerPath = path.join(relativePath, 'logger').replace(/\\/g, '/');
  
  // Add logger import after other requires
  const requireRegex = /^(const .* = require\(.*\);?\s*)+/m;
  const match = content.match(requireRegex);
  
  if (match) {
    const insertion = `const logger = require('${loggerPath}');\n`;
    return content.replace(match[0], match[0] + insertion);
  }
  
  // If no requires found, add at the beginning
  return `const logger = require('${loggerPath}');\n\n` + content;
}

/**
 * Replace console.log patterns
 */
function replaceConsoleLogs(content) {
  let replacements = 0;
  let modifiedContent = content;
  
  // Pattern 1: console.log with string and objects
  // console.log('message:', obj) -> logger.info('message', { obj })
  modifiedContent = modifiedContent.replace(
    /console\.log\(['"]([^'"]+)['"],?\s*([^)]+)\)/g,
    (match, message, args) => {
      replacements++;
      // Remove emojis from message
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.info('${cleanMessage}', { data: ${args} })`;
    }
  );
  
  // Pattern 2: console.log with single string
  // console.log('message') -> logger.info('message')
  modifiedContent = modifiedContent.replace(
    /console\.log\(['"]([^'"]+)['"]\)/g,
    (match, message) => {
      replacements++;
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.info('${cleanMessage}')`;
    }
  );
  
  // Pattern 3: console.error
  modifiedContent = modifiedContent.replace(
    /console\.error\(['"]([^'"]+)['"],?\s*([^)]+)\)/g,
    (match, message, args) => {
      replacements++;
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.error('${cleanMessage}', { error: ${args} })`;
    }
  );
  
  modifiedContent = modifiedContent.replace(
    /console\.error\(['"]([^'"]+)['"]\)/g,
    (match, message) => {
      replacements++;
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.error('${cleanMessage}')`;
    }
  );
  
  // Pattern 4: console.warn
  modifiedContent = modifiedContent.replace(
    /console\.warn\(['"]([^'"]+)['"],?\s*([^)]+)\)/g,
    (match, message, args) => {
      replacements++;
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.warn('${cleanMessage}', { data: ${args} })`;
    }
  );
  
  modifiedContent = modifiedContent.replace(
    /console\.warn\(['"]([^'"]+)['"]\)/g,
    (match, message) => {
      replacements++;
      const cleanMessage = message.replace(/[^\w\s:-]/g, '').trim();
      return `logger.warn('${cleanMessage}')`;
    }
  );
  
  return { content: modifiedContent, replacements };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    // Read file
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file has console.log
    if (!content.includes('console.log') && 
        !content.includes('console.error') && 
        !content.includes('console.warn')) {
      return 0;
    }
    
    console.log(`${colors.blue}📝 Processing: ${path.basename(filePath)}${colors.reset}`);
    
    // Replace console.logs
    const { content: modifiedContent, replacements } = replaceConsoleLogs(content);
    
    if (replacements === 0) {
      return 0;
    }
    
    // Add logger import
    const finalContent = ensureLoggerImport(modifiedContent, filePath);
    
    // Write back to file
    fs.writeFileSync(filePath, finalContent, 'utf8');
    
    console.log(`${colors.green}   ✅ Replaced ${replacements} console statements${colors.reset}`);
    
    totalReplacements += replacements;
    filesModified++;
    
    return replacements;
    
  } catch (error) {
    console.error(`${colors.red}   ❌ Error processing ${filePath}: ${error.message}${colors.reset}`);
    return 0;
  }
}

/**
 * Process directory recursively
 */
function processDirectory(dir) {
  const fullPath = path.join(__dirname, '../../', dir);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`${colors.yellow}⚠️  Directory not found: ${dir}${colors.reset}`);
    return;
  }
  
  console.log(`\n${colors.cyan}📁 Processing directory: ${dir}${colors.reset}`);
  
  const files = fs.readdirSync(fullPath);
  
  files.forEach(file => {
    const filePath = path.join(fullPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other directories
      if (file !== 'node_modules' && !file.startsWith('.')) {
        processDirectory(path.join(dir, file));
      }
    } else if (shouldProcessFile(filePath)) {
      totalFiles++;
      processFile(filePath);
    }
  });
}

/**
 * Main function
 */
function main() {
  console.log(`${colors.blue}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  Console.log Replacement Script           ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  // Process each directory
  directoriesToProcess.forEach(dir => {
    processDirectory(dir);
  });
  
  // Summary
  console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.green}✅ Replacement completed!${colors.reset}`);
  console.log(`${colors.green}📊 Files processed: ${totalFiles}${colors.reset}`);
  console.log(`${colors.green}📝 Files modified: ${filesModified}${colors.reset}`);
  console.log(`${colors.green}🔄 Total replacements: ${totalReplacements}${colors.reset}`);
  console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  if (filesModified > 0) {
    console.log(`${colors.yellow}⚠️  Important:${colors.reset}`);
    console.log(`   1. Review the changes before committing`);
    console.log(`   2. Test your application thoroughly`);
    console.log(`   3. Some complex console.log may need manual adjustment\n`);
  }
}

// Run the script
main();

