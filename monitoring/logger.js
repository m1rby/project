/**
 * Централизованная система логирования для всех сервисов
 * Записывает структурированные логи в JSON формате
 */

const fs = require('fs');
const path = require('path');

// Создаем директорию для логов если её нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.logFile = path.join(logsDir, `${serviceName}.log`);
    this.metricsFile = path.join(logsDir, 'metrics.log');
  }

  /**
   * Записывает лог в файл и консоль
   */
  write(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      data,
      pid: process.pid
    };

    // В консоль
    const prefix = this.getColorPrefix(level);
    console.log(
      `${prefix}[${timestamp}] [${this.serviceName}] ${message}`,
      Object.keys(data).length > 0 ? JSON.stringify(data) : ''
    );

    // В файл
    fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
  }

  /**
   * Логирование на основе уровней
   */
  info(message, data) {
    this.write('INFO', message, data);
  }

  error(message, error, data = {}) {
    this.write('ERROR', message, {
      ...data,
      error: error?.message || error,
      stack: error?.stack
    });
  }

  warn(message, data) {
    this.write('WARN', message, data);
  }

  debug(message, data) {
    if (process.env.DEBUG === 'true') {
      this.write('DEBUG', message, data);
    }
  }

  /**
   * Метрики - для системы мониторинга
   * Записывает в отдельный файл метрик
   */
  metric(name, value, tags = {}) {
    const timestamp = new Date().toISOString();
    const metricEntry = {
      timestamp,
      service: this.serviceName,
      metric: name,
      value,
      tags
    };

    fs.appendFileSync(this.metricsFile, JSON.stringify(metricEntry) + '\n');
  }

  /**
   * Логирование HTTP запросов
   */
  httpRequest(method, path, statusCode, responseTime) {
    this.metric('http_request', responseTime, {
      method,
      path,
      statusCode
    });

    this.info('HTTP Request', {
      method,
      path,
      statusCode,
      responseTimeMs: responseTime
    });
  }

  /**
   * Логирование ошибок БД
   */
  dbError(query, error) {
    this.error('Database Error', error, {
      query: query.substring(0, 100)
    });

    this.metric('db_error', 1, {
      query: query.substring(0, 50)
    });
  }

  /**
   * Логирование успешной операции с БД
   */
  dbQuery(query, responseTime) {
    this.metric('db_query', responseTime, {
      query: query.substring(0, 50)
    });
  }

  /**
   * Логирование успешной аутентификации
   */
  authentication(success, email, error = null) {
    const message = success ? 'User authenticated' : 'Authentication failed';
    this.info(message, {
      email,
      success,
      error
    });

    this.metric('authentication', success ? 1 : 0, {
      email,
      result: success ? 'success' : 'failure'
    });
  }

  /**
   * Логирование создания заказа
   */
  orderCreated(orderId, userId, itemCount, total) {
    this.info('Order created', {
      orderId,
      userId,
      itemCount,
      total
    });

    this.metric('order_created', 1, {
      orderId,
      itemCount
    });

    this.metric('order_total', total, {
      orderId
    });
  }

  /**
   * Цветной вывод в консоль
   */
  getColorPrefix(level) {
    const colors = {
      'INFO': '\x1b[36m',    // Cyan
      'ERROR': '\x1b[31m',   // Red
      'WARN': '\x1b[33m',    // Yellow
      'DEBUG': '\x1b[35m',   // Magenta
      'METRIC': '\x1b[32m'   // Green
    };
    const reset = '\x1b[0m';
    return colors[level] || reset;
  }
}

module.exports = Logger;
