const fs = require('fs');
const path = require('path');

class QueryLogger {
  constructor() {
    this.logs = [];
    this.logFile = path.join(__dirname, '../../logs/query-performance.log');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(operation, query, executionTime, resultCount, additionalInfo = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      query: JSON.stringify(query),
      executionTime: `${executionTime}ms`,
      resultCount,
      ...additionalInfo
    };

    this.logs.push(entry);

    // Console logging with emojis for better visibility
    const emoji = this.getPerformanceEmoji(executionTime);
    console.log(`${emoji} ${entry.timestamp} | ${operation} | Query: ${entry.query} | Time: ${entry.executionTime} | Results: ${resultCount}`);

    // File logging for analysis
    this.writeToFile(entry);

    // Performance warning for slow queries
    if (executionTime > 1000) {
      console.warn(`⚠️ SLOW QUERY DETECTED: ${operation} took ${executionTime}ms`);
    }

    return entry;
  }

  getPerformanceEmoji(executionTime) {
    if (executionTime < 50) return '🚀'; // Very fast
    if (executionTime < 200) return '⚡'; // Fast
    if (executionTime < 500) return '🔄'; // Normal
    if (executionTime < 1000) return '⏳'; // Slow
    return '🐌'; // Very slow
  }

  writeToFile(entry) {
    const logLine = `${entry.timestamp} | ${entry.operation} | ${entry.executionTime} | ${entry.resultCount} results | ${entry.query}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  async explainQuery(model, query) {
    try {
      const explanation = await model.find(query).explain('executionStats');
      return {
        executionStats: explanation.executionStats,
        indexesUsed: explanation.executionStats.totalKeysExamined > 0,
        documentsExamined: explanation.executionStats.totalDocsExamined,
        keysExamined: explanation.executionStats.totalKeysExamined
      };
    } catch (error) {
      console.error('❌ Error explaining query:', error);
      return null;
    }
  }

  getPerformanceStats() {
    if (this.logs.length === 0) return null;

    const times = this.logs.map(log => parseInt(log.executionTime));
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return {
      totalQueries: this.logs.length,
      averageTime: `${avg.toFixed(2)}ms`,
      minTime: `${min}ms`,
      maxTime: `${max}ms`,
      slowQueries: this.logs.filter(log => parseInt(log.executionTime) > 500).length
    };
  }

  clearLogs() {
    this.logs = [];
  }
}

module.exports = new QueryLogger();
