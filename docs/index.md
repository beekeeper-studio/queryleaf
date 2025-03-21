---
template: home.html
homepage: true
title: SQL for MongoDB that just works | QueryLeaf
---

<div class="features-section">
  <div class="container">
    <div class="section-title">
      <h2>Why QueryLeaf?</h2>
      <p>Write in SQL, run on MongoDB with zero translation hassle</p>
    </div>
    
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">🔄</div>
        <h3>Seamless SQL Translation</h3>
        <p>QueryLeaf is a PostgreSQL dialect SQL layer for MongoDB that lets your team use familiar SQL without compromising on MongoDB's power.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">📄</div>
        <h3>Document-Aware SQL</h3>
        <p>Easily access nested fields, arrays, and complex document structures with a SQL syntax that understands MongoDB's document model.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🧰</div>
        <h3>Multiple Ways to Use</h3>
        <p>Use as a library in your code, run the CLI for terminal access, or launch the web server for a MongoDB SQL proxy - flexible options for every workflow.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3>Zero Infrastructure Change</h3>
        <p>Works with your existing MongoDB client instances — no proxies, no middleware, no separate services. Minimal overhead, maximum compatibility.</p>
      </div>
    </div>
  </div>
</div>

<div class="code-sample-section">
  <div class="container">
    <div class="section-title">
      <h2>SQL Queries for MongoDB Documents</h2>
      <p>Write familiar PostgreSQL syntax while QueryLeaf automatically handles nested fields, array elements, and MongoDB ObjectIDs</p>
    </div>
    
    <div class="code-sample-grid">
      <div class="code-sample">
        <div class="code-sample-header">
          <h3>SQL</h3>
        </div>
        <div class="code-sample-content">
```sql
SELECT 
  name, 
  address.city,
  address.geo.coordinates[0] AS longitude,
  preferences.colors[1] AS secondary_color
FROM users
WHERE address.country = 'USA' 
  AND preferences.theme = 'dark'
  AND _id = '507f1f77bcf86cd799439011'
```
        </div>
      </div>
      
      <div class="code-arrow">→</div>
      
      <div class="code-sample">
        <div class="code-sample-header">
          <h3>MongoDB</h3>
        </div>
        <div class="code-sample-content">
```javascript
db.collection('users').find(
  { 
    'address.country': 'USA',
    'preferences.theme': 'dark',
    '_id': ObjectId('507f1f77bcf86cd799439011')
  }, 
  { 
    'name': 1, 
    'address.city': 1,
    'address.geo.coordinates.0': 1,
    'preferences.colors.1': 1
  }
)
```
        </div>
      </div>
    </div>
    
    <div class="code-sample-grid">
      <div class="code-sample">
        <div class="code-sample-header">
          <h3>SQL</h3>
        </div>
        <div class="code-sample-content">
```sql
-- JOIN with automatic ObjectID handling
SELECT u.name, o.total, o.status 
FROM users u 
JOIN orders o ON u._id = o.userId 
WHERE o.items[0].price > 100
  AND o.shipping.address.city = 'Chicago'
```
        </div>
      </div>
      
      <div class="code-arrow">→</div>
      
      <div class="code-sample">
        <div class="code-sample-header">
          <h3>MongoDB</h3>
        </div>
        <div class="code-sample-content">
```javascript
db.collection('users').aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "userId",
      as: "orders"
    }
  },
  { $unwind: { path: "$orders", preserveNullAndEmptyArrays: true } },
  {
    $match: {
      'orders.items.0.price': { $gt: 100 },
      'orders.shipping.address.city': 'Chicago'
    }
  },
  {
    $project: {
      name: 1,
      total: "$orders.total",
      status: "$orders.status"
    }
  }
])
```
        </div>
      </div>
    </div>
    
    <div class="code-sample-buttons">
      <a href="sql-syntax/" class="md-button md-button--primary">
        View Full SQL Syntax Guide
      </a>
    </div>
  </div>
</div>

<div class="use-cases-section">
  <div class="container">
    <div class="section-title">
      <h2>Four Ways to Use QueryLeaf</h2>
      <p>Choose the right option for your workflow</p>
    </div>
    
    <!-- Library Package -->
    <div class="package-section package-library">
      <div class="package-content">
        <h3>1. Library Integration</h3>
        <ul class="package-features">
          <li>Seamlessly integrate SQL to MongoDB translation into your application</li>
          <li>Use with existing MongoDB client instances</li>
          <li>Zero infrastructure change required</li>
          <li>Minimal memory and CPU overhead</li>
          <li>TypeScript support with full type definitions</li>
        </ul>
        <div class="package-buttons">
          <a href="getting-started/installation/" class="md-button">
            Library Installation
          </a>
          <a href="usage/examples/" class="md-button">
            See Examples
          </a>
        </div>
      </div>
      <div class="package-code">
```javascript
import { QueryLeaf } from '@queryleaf/lib';
import { MongoClient } from 'mongodb';

// Your existing MongoDB client
const mongoClient = new MongoClient('mongodb://localhost:27017');
await mongoClient.connect();

// Create QueryLeaf with your MongoDB client
const queryLeaf = new QueryLeaf(mongoClient, 'mydatabase');

// Execute SQL queries against MongoDB
const results = await queryLeaf.execute(`
  SELECT u.name, u.email, COUNT(o._id) as order_count 
  FROM users u 
  LEFT JOIN orders o ON u._id = o.userId
  WHERE u.status = 'active'
  GROUP BY u.name, u.email
  ORDER BY order_count DESC
  LIMIT 10
`);

// Regular MongoDB operations still work normally
const db = mongoClient.db('mydatabase');
await db.collection('logs').insertOne({ 
  event: 'query_executed', 
  timestamp: new Date() 
});
```
      </div>
    </div>
    
    <!-- CLI Package -->
    <div class="package-section package-cli">
      <div class="package-code">
```bash
# Install globally
npm install -g @queryleaf/cli

# Execute a query
queryleaf --db mydb --query "SELECT * FROM users WHERE age > 21"

# Interactive mode
queryleaf --db mydb --interactive

sql> SELECT name, email FROM users LIMIT 5;
name      | email                | age
----------+----------------------+-----------
John Doe  | john@example.com     | 30
Jane Smith| jane@example.com     | 25
...

sql> .tables
Collections in database:
  users
  products
  orders
```
      </div>
      <div class="package-content">
        <h3>2. Command-Line Interface</h3>
        <ul class="package-features">
          <li>Query MongoDB databases using SQL from your terminal</li>
          <li>Interactive SQL shell with auto-completion</li>
          <li>Export results to JSON or CSV formats</li>
          <li>Great for scripts, data extraction, and quick queries</li>
          <li>View collection schemas and database structure</li>
        </ul>
        <div class="package-buttons">
          <a href="usage/cli/" class="md-button">
            CLI Documentation
          </a>
        </div>
      </div>
    </div>
    
    <!-- Server Package -->
    <div class="package-section package-server">
      <div class="package-content">
        <h3>3. Web Server</h3>
        <ul class="package-features">
          <li>Run a MongoDB SQL proxy service with built-in web UI</li>
          <li>RESTful API for SQL query execution</li>
          <li>Connect analytics tools that expect SQL databases</li>
          <li>Swagger API documentation included</li>
          <li>Secure with built-in rate limiting and CORS support</li>
        </ul>
        <div class="package-buttons">
          <a href="usage/server/" class="md-button">
            Server Documentation
          </a>
        </div>
      </div>
      <div class="package-code">
```bash
# Install globally
npm install -g @queryleaf/server

# Start the server
MONGO_DB=mydb queryleaf-server

# Server starts on port 3000
# - Web UI at http://localhost:3000
# - API at http://localhost:3000/api
# - Swagger docs at http://localhost:3000/api-docs
```

```javascript
// API usage
const response = await fetch('http://localhost:3000/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sql: 'SELECT * FROM users WHERE age > 21'
  })
});

const { results, rowCount, executionTime } = await response.json();
```
      </div>
    </div>
    
    <!-- PostgreSQL Server Package -->
    <div class="package-section package-pg-server">
      <div class="package-content">
        <h3>4. PostgreSQL Wire Protocol Server</h3>
        <ul class="package-features">
          <li>Connect to MongoDB using any standard PostgreSQL client</li>
          <li>Use tools like pgAdmin, DBeaver, or Beekeeper Studio</li>
          <li>Native integration with any application supporting PostgreSQL</li>
          <li>No specialized drivers or adapters needed</li>
          <li>Transaction support (BEGIN, COMMIT, ROLLBACK)</li>
        </ul>
        <div class="package-buttons">
          <a href="usage/postgres-server/" class="md-button">
            PostgreSQL Server Documentation
          </a>
        </div>
      </div>
      <div class="package-code">
```bash
# Install globally
npm install -g @queryleaf/postgres-server

# Start the PostgreSQL-compatible server
queryleaf-pg-server --db mydb

# Connect with any PostgreSQL client:
psql -h localhost -p 5432 -d mydb -U any_username
```

```
# Or use in your application code:
import { MongoClient } from 'mongodb';
import { PostgresServer } from '@queryleaf/postgres-server';

// Create and start the server
const mongoClient = new MongoClient('mongodb://localhost:27017');
await mongoClient.connect();

const pgServer = new PostgresServer(mongoClient, 'mydb', {
  port: 5432,
  host: 'localhost'
});
```
      </div>
    </div>
    
    <div class="package-buttons-container">
      <a href="getting-started/installation/" class="md-button md-button--primary">
        Get Started with QueryLeaf
      </a>
    </div>
  </div>
</div>

<style>
.use-cases-section {
  padding: 60px 0;
}

.package-section {
  display: flex;
  margin: 40px 0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.package-library {
  background: linear-gradient(to right, #f5f9f5, #ffffff);
}

.package-cli {
  background: linear-gradient(to right, #ffffff, #f5f9f5);
  flex-direction: row-reverse;
}

.package-server {
  background: linear-gradient(to right, #f5f9f5, #ffffff);
}

.package-pg-server {
  background: linear-gradient(to right, #ffffff, #f5f9f5);
  flex-direction: row-reverse;
}

.package-content, .package-code {
  flex: 1;
  padding: 30px;
}

.package-content h3 {
  font-size: 24px;
  margin-top: 0;
  color: #2e7d32;
  border-bottom: 2px solid #2e7d32;
  padding-bottom: 10px;
  display: inline-block;
}

.package-features {
  list-style-type: none;
  padding-left: 5px;
  margin: 20px 0;
}

.package-features li {
  padding: 8px 0 8px 30px;
  position: relative;
}

.package-features li:before {
  content: "✓";
  color: #2e7d32;
  font-weight: bold;
  position: absolute;
  left: 0;
}

.package-buttons {
  margin-top: 20px;
}

.package-buttons-container {
  text-align: center;
  margin-top: 40px;
}

@media (max-width: 768px) {
  .package-section {
    flex-direction: column;
  }
  
  .package-cli {
    flex-direction: column;
  }
}
</style>

<div id="pricing" class="pricing-section">
  <div class="container">
    <div class="section-title">
      <h2>Pricing & Licensing</h2>
      <p>Choose the plan that's right for your needs</p>
    </div>
    
    <div class="pricing-tiers">
      <div class="pricing-card">
        <div class="pricing-header">
          <h3>Professional</h3>
          <div class="pricing-cost">
            <span class="price">$98/month</span>
            <span class="price-period">or $995/year</span>
          </div>
          <p class="pricing-description">Up to 10 developers</p>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Commercial usage license</li>
            <li>All features & packages</li>
            <li>Email support</li>
            <li>Use in internal applications only</li>
            <li>Up to 2 MongoDB Servers</li>
          </ul>
        </div>
        
        <div class="pricing-footer">
          <a href="mailto:sales@queryleaf.com?subject=QueryLeaf Professional License" class="md-button">
            Purchase License
          </a>
        </div>
      </div>
      
      <div class="pricing-card pricing-card-highlighted">
        <div class="pricing-header">
          <h3>Business</h3>
          <div class="pricing-cost">
            <span class="price">$199/month</span>
            <span class="price-period">or $1995/year</span>
          </div>
          <p class="pricing-description">Up to 50 developers</p>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Everything in Professional tier</li>
            <li>More users</li>
            <li>Priority email support</li>
            <li>Use in external SaaS applications</li>
            <li>Up to 5 MongoDB Servers</li>
          </ul>
        </div>
        
        <div class="pricing-footer">
          <a href="mailto:sales@queryleaf.com?subject=QueryLeaf Business License" class="md-button md-button--primary">
            Purchase License
          </a>
        </div>
      </div>
      
      <div class="pricing-card">
        <div class="pricing-header">
          <h3>Enterprise</h3>
          <div class="pricing-cost">
            <span class="price">Contact</span>
            <span class="price-period">custom pricing</span>
          </div>
          <p class="pricing-description">For large organizations and OEM licensing</p>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Everything in Business tier</li>
            <li>Use in OEM applications</li>
            <li>Unlimited MongoDB Servers</li>
            <li>Commercial source license</li>
            <li>Credit card or invoice payment</li>
          </ul>
        </div>
        
        <div class="pricing-footer">
          <a href="mailto:enterprise@queryleaf.com?subject=QueryLeaf Enterprise License" class="md-button">
            Contact Sales
          </a>
        </div>
      </div>
    </div>
    
    <div class="community-card">
      <div class="community-content">
        <div class="community-header">
          <h3>Community Edition</h3>
          <div class="community-cost">
            <span class="price">$0</span>
            <span class="price-period">forever</span>
          </div>
        </div>
        <p class="community-description">
          Free for personal use, trial under commercial license, or free forever under AGPL
        </p>
        <div class="community-features">
          <ul>
            <li>Full feature set including Library, CLI, and Server</li>
            <li>AGPL v3 license</li>
            <li>Community support via GitHub</li>
            <li>Source code access</li>
          </ul>
        </div>
      </div>
      <div class="community-cta">
        <a href="getting-started/installation/" class="md-button">
          Get Started Free
        </a>
      </div>
    </div>
  </div>
</div>

<style>
.pricing-section {
  padding: 60px 0;
  background: #f8f9fa;
}

.pricing-tiers {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 30px;
  margin: 40px 0 20px;
}

.pricing-card {
  flex: 1;
  min-width: 280px;
  max-width: 350px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  background: white;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s, box-shadow 0.3s;
}

.pricing-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.pricing-card-highlighted {
  border: 2px solid #2e7d32;
  position: relative;
}

.pricing-card-highlighted:before {
  content: "Most Popular";
  position: absolute;
  top: 0;
  right: 0;
  background: #2e7d32;
  color: white;
  font-size: 12px;
  font-weight: bold;
  padding: 5px 10px;
  border-radius: 0 0 0 8px;
}

.pricing-header {
  padding: 25px 20px;
  text-align: center;
  background: #f5f9f5;
  border-bottom: 1px solid #e0e0e0;
}

.pricing-header h3 {
  margin: 0 0 15px;
  font-size: 22px;
  color: #2e7d32;
}

.pricing-cost {
  margin-bottom: 15px;
}

.price {
  font-size: 36px;
  font-weight: bold;
}

.price-period {
  font-size: 14px;
  color: #666;
  display: block;
  margin-top: 5px;
}

.pricing-description {
  font-size: 14px;
  color: #666;
  margin: 10px 0 0;
}

.pricing-features {
  padding: 20px;
  flex-grow: 1;
}

.pricing-features ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

.pricing-features li {
  padding: 8px 0 8px 28px;
  position: relative;
  font-size: 15px;
}

.pricing-features li:before {
  content: "✓";
  color: #2e7d32;
  font-weight: bold;
  position: absolute;
  left: 0;
}

.pricing-footer {
  padding: 20px;
  text-align: center;
  border-top: 1px solid #e0e0e0;
}

.pricing-more-info {
  text-align: center;
  color: #666;
  font-size: 14px;
  margin-top: 20px;
}

/* Community card styles */
.community-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to right, #f0f9f0, #ffffff);
  border-radius: 10px;
  padding: 25px 40px;
  margin-top: 40px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border: 1px dashed #2e7d32;
}

.community-content {
  display: flex;
  flex-wrap: wrap;
  flex: 1;
}

.community-header {
  margin-right: 30px;
  min-width: 200px;
}

.community-header h3 {
  margin: 0 0 10px;
  font-size: 22px;
  color: #2e7d32;
}

.community-cost {
  margin-bottom: 10px;
}

.community-description {
  font-size: 15px;
  color: #555;
  margin: 0 30px 0 0;
  max-width: 250px;
  flex-shrink: 0;
}

.community-features {
  flex: 1;
}

.community-features ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
}

.community-features li {
  padding: 4px 10px 4px 25px;
  position: relative;
  font-size: 14px;
  flex: 1 0 45%;
  min-width: 200px;
}

.community-features li:before {
  content: "✓";
  color: #2e7d32;
  font-weight: bold;
  position: absolute;
  left: 0;
}

.community-cta {
  padding-left: 20px;
  border-left: 1px dashed #ccc;
}

@media (max-width: 1024px) {
  .community-card {
    flex-direction: column;
    padding: 25px;
  }
  
  .community-content {
    margin-bottom: 20px;
  }
  
  .community-cta {
    padding-left: 0;
    border-left: none;
    border-top: 1px dashed #ccc;
    padding-top: 20px;
    width: 100%;
    text-align: center;
  }
  
  .community-description {
    margin: 0 0 15px 0;
    max-width: 100%;
  }
  
  .community-features ul {
    flex-direction: column;
  }
  
  .community-features li {
    flex: 1 0 100%;
  }
}

@media (max-width: 768px) {
  .pricing-tiers {
    flex-direction: column;
    align-items: center;
  }
  
  .pricing-card {
    width: 100%;
    max-width: 400px;
    margin-bottom: 20px;
  }
  
  .community-header {
    margin-right: 0;
    margin-bottom: 15px;
    width: 100%;
  }
  
  .community-content {
    flex-direction: column;
  }
}
</style>

<div class="cta-section">
  <div class="container">
    <h2>The best of both worlds: SQL syntax with MongoDB power</h2>
    <p>Join teams that use QueryLeaf to simplify MongoDB development without sacrificing document database capabilities</p>
    <div class="cta-buttons">
      <a href="getting-started/installation/" class="md-button md-button--primary">
        Get Started Free
      </a>
      <a href="mailto:demo@queryleaf.com?subject=QueryLeaf Demo Request" class="md-button md-button--dark">
        Request a Demo
      </a>
    </div>
  </div>
</div>

<div class="footer-copyright">
  <div class="container">
    <p>© 2023-2025 Beekeeper Studio, Inc. All rights reserved.</p>
  </div>
</div>

<style>
.footer-copyright {
  background-color: #f5f5f5;
  padding: 20px 0;
  margin-top: 60px;
  border-top: 1px solid #e0e0e0;
  text-align: center;
}

.footer-copyright p {
  color: #666;
  font-size: 14px;
  margin: 0;
}
</style>