# License FAQ

## Managing existing licenses

Go to the [QueryLeaf Billing Dashboard](https://billing.stripe.com/p/login/bIYdRKdtcfklgdqaEE) to manage existing subscriptions

## General Questions

### What license does QueryLeaf use?
QueryLeaf uses a dual licensing model:
- GNU Affero General Public License v3 (AGPL-3.0) for the Community Edition
- Commercial License for businesses using QueryLeaf in proprietary applications

### What is the difference between the AGPL and Commercial Licenses?
The AGPL is a strong copyleft license that requires any modifications to be shared under the same license and requires source code disclosure if you run a modified version as a service. The Commercial License removes these requirements, allowing you to use QueryLeaf in proprietary applications without disclosing your source code.

### Which license should I choose?
- Choose the **AGPL license** if you are working on open source projects, personal projects, or for evaluation.
- Choose the **Commercial License** if you are using QueryLeaf in a proprietary application, especially if you're offering it as a service or if you need commercial support.

## AGPL Questions

### Can I use the AGPL version in a commercial project?
Yes, but with important caveats. If your application is offered as a service (including web applications), the AGPL requires you to make the source code of your application available to users, including any modifications you've made to QueryLeaf.

### Does the AGPL affect my entire application?
Yes, the AGPL's copyleft provisions generally extend to the entire application that incorporates the AGPL-licensed code, not just the QueryLeaf parts.

### What if I'm only using QueryLeaf internally?
Even internal usage may trigger AGPL requirements if users (including employees) interact with the application over a network. For purely internal tools where source code is never shared outside your organization, AGPL may be suitable, but consult with your legal team.

## Commercial License Questions

### What does the Commercial License cover?
The Commercial License covers all QueryLeaf components:
- Core library
- Command-line interface (CLI)
- Web Server
- PostgreSQL Server

### Are there any usage limitations with the Commercial License?
The Commercial License prohibits:
- Using QueryLeaf to create a competing product
- Redistributing QueryLeaf as a standalone product
- Removing copyright notices

### Do I need a license for each developer or for each deployment?
Our pricing is structured per developer for the Developer License. The Business License covers unlimited developers. There are no additional per-deployment or per-server fees.

### Do I need to purchase a separate license for the PostgreSQL Server?
No, all server components (Web Server and PostgreSQL Server) are included in the same Commercial License. There's no need to purchase separate licenses for different components.

## Server-specific Questions

### Does the AGPL apply to the PostgreSQL Server and Web Server components?
Yes, if you're using the AGPL version, the license requirements apply to both server components. If you run either server as a service, you must make the source code (including modifications) available to users of that service.

### Are there any technical limitations in the Community Edition of the servers?
No, the Community Edition includes the full functionality of both server components. The difference is purely in the licensing terms, not in technical capabilities.

### Can I embed the PostgreSQL Server in my application?
- With the **AGPL license**: Yes, but you must make your application's source code available to users.
- With the **Commercial license**: Yes, with no requirement to disclose your source code.

## Support Questions

### Does the Commercial License include support?
Yes, all commercial licenses include email support. Higher-tier licenses include priority support, quarterly reviews, and dedicated account managers.

### Is there any support for the Community Edition?
Community support is available through GitHub issues. Commercial support is only available with a paid license.

### How do I upgrade my license?
To upgrade from Developer to Business or from Business to Enterprise, contact [sales@queryleaf.com](mailto:sales@queryleaf.com) with your current license information.

## Still Have Questions?

If you have additional questions about licensing or need help determining which license is right for you, please contact us:

- Email: [sales@queryleaf.com](mailto:sales@queryleaf.com)
- Subject: "License Question"