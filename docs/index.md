---
template: home.html
homepage: true
title: QueryLeaf - SQL for MongoDB | Write PostgreSQL, Run MongoDB
---

<div class="features-section">
  <div class="container">
    <div class="section-title">
      <h2>Why QueryLeaf?</h2>
      <p>Write in PostgreSQL, run on MongoDB with zero translation hassle</p>
    </div>
    
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">🔄</div>
        <h3>Seamless SQL Translation</h3>
        <p>QueryLeaf is a PostgreSQL-compatible SQL layer for MongoDB that lets your team use familiar SQL without compromising on MongoDB's power.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">📄</div>
        <h3>Document-Aware SQL</h3>
        <p>Easily access nested fields, arrays, and complex document structures with a SQL syntax that understands MongoDB's document model.</p>
      </div>
      
      <div class="feature-card">
        <div class="feature-icon">🧰</div>
        <h3>Zero Infrastructure Change</h3>
        <p>Works with your existing MongoDB client instances — no proxies, no middleware, no separate services. Minimal overhead, maximum compatibility.</p>
      </div>
    </div>
  </div>
</div>

<div class="code-sample-section">
  <div class="container">
    <div class="section-title">
      <h2>PostgreSQL Queries for MongoDB Documents</h2>
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

<div class="integration-section">
  <div class="container">
    <div class="section-title">
      <h2>No-Hassle Integration</h2>
      <p>Works with your existing MongoDB code - no connection changes required</p>
    </div>
    
    <div class="integration-code">
```javascript
import { QueryLeaf } from 'queryleaf';
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
    
    <div class="integration-buttons">
      <a href="getting-started/installation/" class="md-button md-button--primary">
        5-Minute Installation Guide
      </a>
    </div>
  </div>
</div>

<div id="pricing" class="pricing-section">
  <div class="container">
    <div class="section-title">
      <h2>Pricing Plans</h2>
      <p>Choose the right plan for your needs</p>
    </div>
    
    <div class="pricing-oss">
      <div class="pricing-card">
        <div class="pricing-header">
          <h3>Open Source</h3>
          <div class="pricing-price">
            <span class="price-free">Free</span>
          </div>
          <p class="pricing-description">Totally free under the terms of the AGPL v3 license</p>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Full feature set</li>
            <li>AGPL license</li>
            <li>Community support via GitHub</li>
            <li>Documentation access</li>
          </ul>
        </div>
        
        <div class="pricing-button">
          <a href="licenses/agpl/" class="md-button">
            Read License Details
          </a>
        </div>
      </div>
    </div>
    
    <div class="pricing-separator">
      <span>Commercial Licenses</span>
    </div>
    
    <div class="pricing-grid">
      <div class="pricing-card">
        <div class="pricing-header">
          <h3>Indie</h3>
          <div class="pricing-price">
            <span class="price-currency">$</span>
            <span class="price">49</span>
            <span class="period">/month</span>
          </div>
          <p class="pricing-description">For independent developers and small teams</p>
          <p class="pricing-guarantee">30-day money-back guarantee</p>
        </div>
        
        <div class="pricing-button">
          <a href="licenses/commercial/" class="md-button">
            Get Started
          </a>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Full feature set</li>
            <li>Commercial license</li>
            <li>Up to 5 developers</li>
            <li>Email support</li>
            <li>Proprietary application use</li>
            <li>Annual billing option (save 10%)</li>
          </ul>
        </div>
      </div>
      
      <div class="pricing-card pricing-card--highlighted">
        <div class="pricing-badge">POPULAR</div>
        <div class="pricing-header">
          <h3>Startup</h3>
          <div class="pricing-price">
            <span class="price-currency">$</span>
            <span class="price">149</span>
            <span class="period">/month</span>
          </div>
          <p class="pricing-description">For growing teams with advanced MongoDB needs</p>
          <p class="pricing-guarantee">30-day money-back guarantee</p>
        </div>
        
        <div class="pricing-button">
          <a href="licenses/commercial/" class="md-button md-button--primary">
            Get Started
          </a>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Full feature set</li>
            <li>Commercial license</li>
            <li>Up to 20 developers</li>
            <li>Priority email support</li>
            <li>Proprietary application use</li>
            <li>Dedicated Slack channel</li>
            <li>Integration assistance</li>
            <li>Annual billing option (save 15%)</li>
          </ul>
        </div>
      </div>
      
      <div class="pricing-card">
        <div class="pricing-header">
          <h3>Business</h3>
          <div class="pricing-price">
            <span class="price-currency">$</span>
            <span class="price">349</span>
            <span class="period">/month</span>
          </div>
          <p class="pricing-description">For businesses with complex MongoDB deployments</p>
          <p class="pricing-guarantee">30-day money-back guarantee</p>
        </div>
        
        <div class="pricing-button">
          <a href="licenses/commercial/" class="md-button">
            Get Started
          </a>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Full feature set</li>
            <li>Commercial license</li>
            <li>Unlimited developers</li>
            <li>Priority support with SLA</li>
            <li>Proprietary application use</li>
            <li>Dedicated Slack channel</li>
            <li>Integration consulting</li>
            <li>Custom feature development</li>
            <li>Annual billing option (save 20%)</li>
          </ul>
        </div>
      </div>
      
      <div class="pricing-card pricing-card--enterprise">
        <div class="pricing-header">
          <h3>Enterprise</h3>
          <div class="pricing-price">
            <span class="price">Contact Us</span>
          </div>
          <p class="pricing-description">For specialized use cases, high-volume applications, and custom deployments</p>
        </div>
        
        <div class="pricing-button">
          <a href="mailto:info@queryleaf.com" class="md-button">
            Contact Sales
          </a>
        </div>
        
        <div class="pricing-features">
          <ul>
            <li>Everything in Business plan</li>
            <li>Custom licensing terms</li>
            <li>White-glove onboarding</li>
            <li>24/7 support options</li>
            <li>Performance optimization</li>
            <li>Custom integration services</li>
            <li>On-site training available</li>
          </ul>
        </div>
      </div>
    </div>
    
    <div class="pricing-comparison">
      <a href="licenses/commercial/">View detailed plan comparison</a>
    </div>
    
    <div class="pricing-faq">
      <h3>Frequently Asked Questions</h3>
      
      <div class="faq-grid">
        <div class="faq-item">
          <h4>What happens after the 30-day guarantee period?</h4>
          <p>If you're not satisfied for any reason within the first 30 days, you can request a full refund. After that, your subscription will continue automatically until canceled.</p>
        </div>
        
        <div class="faq-item">
          <h4>Can I switch plans later?</h4>
          <p>Yes, you can upgrade or downgrade your plan at any time. When upgrading, we'll prorate your existing subscription. When downgrading, changes take effect at the next billing cycle.</p>
        </div>
        
        <div class="faq-item">
          <h4>How does the license work?</h4>
          <p>Commercial licenses allow you to use QueryLeaf in proprietary applications without the AGPL requirements. The license is based on the number of developers working with the code.</p>
        </div>
        
        <div class="faq-item">
          <h4>Is there a way to try QueryLeaf before purchasing?</h4>
          <p>Yes! You can use the open source version under AGPL for evaluation, or request a demo from our team to see how it works in your specific use case.</p>
        </div>
      </div>
    </div>
  </div>
</div>

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