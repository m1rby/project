/**
 * Система мониторинга на основе парсинга логов
 * Анализирует логи и выводит статистику в реальном времени
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class Monitor {
  constructor() {
    this.metrics = {
      http_requests: [],
      errors: [],
      authentications: [],
      orders: [],
      db_queries: [],
      uptime: Date.now()
    };
    this.logsDir = path.join(__dirname, '../logs');
  }

  /**
   * Читает файл метрик и парсит его
   */
  parseMetricsFile() {
    const metricsFile = path.join(this.logsDir, 'metrics.log');

    if (!fs.existsSync(metricsFile)) {
      return { error: 'Metrics file not found' };
    }

    try {
      const content = fs.readFileSync(metricsFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      this.metrics = {
        http_requests: [],
        errors: [],
        authentications: [],
        orders: [],
        db_queries: [],
        uptime: Date.now()
      };

      lines.forEach(line => {
        try {
          const entry = JSON.parse(line);

          if (entry.metric === 'http_request') {
            this.metrics.http_requests.push(entry);
          } else if (entry.metric === 'db_error') {
            this.metrics.errors.push(entry);
          } else if (entry.metric === 'authentication') {
            this.metrics.authentications.push(entry);
          } else if (entry.metric === 'order_created') {
            this.metrics.orders.push(entry);
          } else if (entry.metric === 'db_query') {
            this.metrics.db_queries.push(entry);
          }
        } catch (e) {
          // Некорректная строка, пропускаем
        }
      });

      return this.metrics;
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Получает статистику по HTTP запросам
   */
  getHttpStats() {
    const requests = this.metrics.http_requests;

    if (requests.length === 0) return null;

    const avgResponseTime = requests.reduce((sum, r) => sum + r.value, 0) / requests.length;
    const maxResponseTime = Math.max(...requests.map(r => r.value));
    const minResponseTime = Math.min(...requests.map(r => r.value));

    const by2xx = requests.filter(r => r.tags.statusCode >= 200 && r.tags.statusCode < 300).length;
    const by4xx = requests.filter(r => r.tags.statusCode >= 400 && r.tags.statusCode < 500).length;
    const by5xx = requests.filter(r => r.tags.statusCode >= 500).length;

    return {
      totalRequests: requests.length,
      avgResponseTime: avgResponseTime.toFixed(2),
      maxResponseTime,
      minResponseTime,
      statusCodes: {
        '2xx': by2xx,
        '4xx': by4xx,
        '5xx': by5xx
      },
      recentRequests: requests.slice(-10)
    };
  }

  /**
   * Получает статистику по ошибкам
   */
  getErrorStats() {
    const errors = this.metrics.errors;

    if (errors.length === 0) return { totalErrors: 0 };

    return {
      totalErrors: errors.length,
      recentErrors: errors.slice(-5)
    };
  }

  /**
   * Получает статистику по аутентификации
   */
  getAuthStats() {
    const auths = this.metrics.authentications;

    if (auths.length === 0) return null;

    const successful = auths.filter(a => a.value === 1).length;
    const failed = auths.filter(a => a.value === 0).length;

    return {
      totalAttempts: auths.length,
      successful,
      failed,
      successRate: ((successful / auths.length) * 100).toFixed(2) + '%',
      recentAttempts: auths.slice(-5)
    };
  }

  /**
   * Получает статистику по заказам
   */
  getOrderStats() {
    const orders = this.metrics.orders;

    if (orders.length === 0) return { totalOrders: 0 };

    const totalRevenue = this.metrics.db_queries.length; // Упрощенно
    const avgOrderValue = orders.length > 0
      ? (orders.reduce((sum, o) => {
          const total = o.tags.itemCount ? 1000 * o.tags.itemCount : 0; // Примерная цена
          return sum + total;
        }, 0) / orders.length).toFixed(2)
      : 0;

    return {
      totalOrders: orders.length,
      avgOrderValue,
      recentOrders: orders.slice(-5)
    };
  }

  /**
   * Получает статистику по БД
   */
  getDbStats() {
    const queries = this.metrics.db_queries;

    if (queries.length === 0) return null;

    const avgQueryTime = queries.reduce((sum, q) => sum + q.value, 0) / queries.length;
    const maxQueryTime = Math.max(...queries.map(q => q.value));
    const slowQueries = queries.filter(q => q.value > 100); // Более 100ms

    return {
      totalQueries: queries.length,
      avgQueryTime: avgQueryTime.toFixed(2),
      maxQueryTime,
      slowQueries: slowQueries.length,
      slowQueriesPercent: ((slowQueries.length / queries.length) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Общая статистика системы
   */
  getOverallStats() {
    this.parseMetricsFile();

    return {
      timestamp: new Date().toISOString(),
      http: this.getHttpStats(),
      errors: this.getErrorStats(),
      auth: this.getAuthStats(),
      orders: this.getOrderStats(),
      database: this.getDbStats(),
      systemUptime: Math.floor((Date.now() - this.metrics.uptime) / 1000) + 's'
    };
  }

  /**
   * Вывод красивой статистики в консоль
   */
  printStats() {
    const stats = this.getOverallStats();

    console.clear();
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║              ФАРМАЦЕВТИЧЕСКИЙ E-COMMERCE МОНИТОРИНГ            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // HTTP Статистика
    if (stats.http) {
      console.log('📊 HTTP ЗАПРОСЫ:');
      console.log(`   • Всего: ${stats.http.totalRequests}`);
      console.log(`   • Среднее время ответа: ${stats.http.avgResponseTime}ms`);
      console.log(`   • Макс время: ${stats.http.maxResponseTime}ms, Мин время: ${stats.http.minResponseTime}ms`);
      console.log(`   • Статусы: 2xx=${stats.http.statusCodes['2xx']}, 4xx=${stats.http.statusCodes['4xx']}, 5xx=${stats.http.statusCodes['5xx']}`);
      console.log();
    }

    // Ошибки
    console.log('⚠️  ОШИБКИ:');
    console.log(`   • Всего ошибок: ${stats.errors.totalErrors}`);
    if (stats.errors.recentErrors && stats.errors.recentErrors.length > 0) {
      console.log('   • Последние ошибки:');
      stats.errors.recentErrors.forEach(err => {
        console.log(`     - [${err.service}] ${err.tags.query || 'Unknown'}`);
      });
    }
    console.log();

    // Аутентификация
    if (stats.auth) {
      console.log('🔐 АУТЕНТИФИКАЦИЯ:');
      console.log(`   • Попыток: ${stats.auth.totalAttempts}`);
      console.log(`   • Успешных: ${stats.auth.successful}, Неудачных: ${stats.auth.failed}`);
      console.log(`   • Процент успеха: ${stats.auth.successRate}`);
      console.log();
    }

    // Заказы
    if (stats.orders.totalOrders > 0) {
      console.log('📦 ЗАКАЗЫ:');
      console.log(`   • Всего заказов: ${stats.orders.totalOrders}`);
      console.log(`   • Средняя стоимость: ${stats.orders.avgOrderValue} ₽`);
      console.log();
    }

    // БД
    if (stats.database) {
      console.log('💾 БАЗА ДАННЫХ:');
      console.log(`   • Всего запросов: ${stats.database.totalQueries}`);
      console.log(`   • Среднее время: ${stats.database.avgQueryTime}ms`);
      console.log(`   • Медленных запросов: ${stats.database.slowQueries} (${stats.database.slowQueriesPercent})`);
      console.log();
    }

    console.log(`⏱️  Время обновления: ${stats.timestamp}`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  }

  /**
   * Запуск мониторинга в real-time режиме (обновление каждые N сек)
   */
  startMonitoring(intervalSeconds = 5) {
    console.log(`\n🚀 Мониторинг запущен (обновление каждые ${intervalSeconds}s)\n`);

    this.printStats();

    setInterval(() => {
      this.printStats();
    }, intervalSeconds * 1000);
  }
}

module.exports = Monitor;
