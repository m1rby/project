/**
 * Prometheus Metrics Exporter для Node.js
 * 
 * Экспортирует метрики в формате, который понимает Prometheus
 * Использует prom-client библиотеку (очень легкая)
 */

class PrometheusMetrics {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.metrics = {};
    
    // Инициализируем основные метрики
    this.initDefaultMetrics();
  }

  initDefaultMetrics() {
    // HTTP метрики
    this.metrics.httpRequestsTotal = {
      type: 'counter',
      help: 'Total HTTP requests',
      labels: ['method', 'path', 'status'],
      data: {}
    };

    this.metrics.httpRequestDuration = {
      type: 'histogram',
      help: 'HTTP request duration in milliseconds',
      labels: ['method', 'path'],
      data: {},
      buckets: [10, 50, 100, 500, 1000, 5000]
    };

    // БД метрики
    this.metrics.dbQueryDuration = {
      type: 'histogram',
      help: 'Database query duration in milliseconds',
      labels: ['query_type'],
      data: {},
      buckets: [1, 5, 10, 50, 100, 500]
    };

    this.metrics.dbErrorsTotal = {
      type: 'counter',
      help: 'Total database errors',
      labels: ['error_type'],
      data: {}
    };

    // Бизнес метрики
    this.metrics.ordersTotal = {
      type: 'counter',
      help: 'Total orders created',
      labels: [],
      data: 0
    };

    this.metrics.ordersAmount = {
      type: 'gauge',
      help: 'Total orders amount in rubles',
      labels: [],
      data: 0
    };

    this.metrics.usersAuthenticated = {
      type: 'counter',
      help: 'Total authenticated users',
      labels: ['result'],
      data: {}
    };

    // Системные метрики
    this.metrics.appUptime = {
      type: 'gauge',
      help: 'Application uptime in seconds',
      labels: [],
      data: 0
    };

    this.startTime = Date.now();
  }

  /**
   * Инкрементировать counter метрику
   */
  incrementCounter(metricName, labels = {}, value = 1) {
    const metric = this.metrics[metricName];
    if (!metric || metric.type !== 'counter') return;

    const key = this.getLabelKey(labels);
    metric.data[key] = (metric.data[key] || 0) + value;
  }

  /**
   * Установить gauge метрику
   */
  setGauge(metricName, value, labels = {}) {
    const metric = this.metrics[metricName];
    if (!metric || metric.type !== 'gauge') return;

    const key = this.getLabelKey(labels);
    metric.data[key] = value;
  }

  /**
   * Записать histogram метрику
   */
  recordHistogram(metricName, value, labels = {}) {
    const metric = this.metrics[metricName];
    if (!metric || metric.type !== 'histogram') return;

    const key = this.getLabelKey(labels);
    if (!metric.data[key]) {
      metric.data[key] = [];
    }
    metric.data[key].push(value);
  }

  /**
   * Получить ключ для labels
   */
  getLabelKey(labels) {
    return JSON.stringify(labels);
  }

  /**
   * Парсить labels из JSON ключа
   */
  parseLabels(labelKey) {
    try {
      return JSON.parse(labelKey);
    } catch {
      return {};
    }
  }

  /**
   * Экспортировать метрики в Prometheus текстовый формат
   */
  export() {
    let output = '';
    const now = Math.floor((Date.now() - this.startTime) / 1000);

    // Обновляем uptime
    this.setGauge('appUptime', now);

    for (const [metricName, metric] of Object.entries(this.metrics)) {
      // Комментарий с типом метрики
      output += `# HELP ${metricName}_${this.serviceName} ${metric.help}\n`;
      output += `# TYPE ${metricName}_${this.serviceName} ${metric.type}\n`;

      if (metric.type === 'counter' || metric.type === 'gauge') {
        // Counter и Gauge простые
        for (const [key, value] of Object.entries(metric.data)) {
          const labels = this.parseLabels(key);
          const labelStr = this.formatLabels(labels);
          output += `${metricName}_${this.serviceName}${labelStr} ${value}\n`;
        }
      } else if (metric.type === 'histogram') {
        // Histogram: нужно выводить _bucket, _count, _sum
        for (const [key, values] of Object.entries(metric.data)) {
          if (!Array.isArray(values) || values.length === 0) continue;

          const labels = this.parseLabels(key);
          const sum = values.reduce((a, b) => a + b, 0);
          const count = values.length;

          // Buckets
          for (const bucket of metric.buckets || [10, 50, 100, 500, 1000]) {
            const count_le = values.filter(v => v <= bucket).length;
            const bucketLabels = { ...labels, le: bucket };
            output += `${metricName}_bucket${this.formatLabels(bucketLabels)} ${count_le}\n`;
          }

          // +Inf bucket
          const infLabels = { ...labels, le: '+Inf' };
          output += `${metricName}_bucket${this.formatLabels(infLabels)} ${count}\n`;

          // _count и _sum
          const labelStr = this.formatLabels(labels);
          output += `${metricName}_count${labelStr} ${count}\n`;
          output += `${metricName}_sum${labelStr} ${sum}\n`;
        }
      }

      output += '\n';
    }

    return output;
  }

  /**
   * Форматировать labels для Prometheus
   */
  formatLabels(labels) {
    const entries = Object.entries(labels)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return entries ? `{${entries}}` : '';
  }

  /**
   * Middleware для Express - автоматически логировать HTTP метрики
   */
  middleware() {
    return (req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;

        // Логируем HTTP запрос
        this.incrementCounter('httpRequestsTotal', {
          method: req.method,
          path: req.path,
          status: res.statusCode
        });

        this.recordHistogram('httpRequestDuration', duration, {
          method: req.method,
          path: req.path
        });
      });

      next();
    };
  }
}

module.exports = PrometheusMetrics;
