# AGPL-3.0 License

## Overview

QueryLeaf is dual-licensed under the GNU Affero General Public License version 3 (AGPL-3.0) for open source use and under a [Commercial License](commercial.md) for commercial use with embedding.

The AGPL-3.0 license is a free, copyleft license that ensures that any modifications to the software remain open source and freely available. This page provides an overview of the AGPL-3.0 license and what it means for users of QueryLeaf.

## What the AGPL-3.0 License Allows

Under the AGPL-3.0 license, you are free to:

- **Use** the software for any purpose
- **Modify** the software to suit your needs
- **Distribute** copies of the software
- **Access** the source code

## Key AGPL-3.0 Requirements

When using QueryLeaf under the AGPL-3.0 license, you must:

1. **Preserve Copyright Notices**: Keep all copyright notices intact
2. **Provide Source Code**: Make the complete source code available when you distribute the software
3. **License Modifications Under AGPL-3.0**: Any modifications you make must also be licensed under AGPL-3.0
4. **Network Use is Distribution**: If you run a modified version of the software on a network server, you must make the source code of your modified version available to the users of that server

## Important Consideration for Web Applications

The most significant aspect of the AGPL-3.0 license is the "network use" provision. Unlike the GPL, which only requires source code disclosure when you distribute the software, the AGPL extends this requirement to network use:

> If you run a modified version of the program on a server and let other users communicate with it there, your server must also allow them to download the source code corresponding to the modified version running there.

This means that if you modify QueryLeaf and use it in a web application or API that others interact with over a network, you must make your entire source code available to those users.

## When to Consider the Commercial License

You should consider purchasing the [Commercial License](commercial.md) if:

1. You want to embed QueryLeaf into a commercial product
2. You plan to modify QueryLeaf but don't want to share your modifications
3. You want to use QueryLeaf in a closed-source application
4. You want to avoid the AGPL's source code disclosure requirements

## Full AGPL-3.0 License Text

The full text of the AGPL-3.0 license can be found at:
[https://www.gnu.org/licenses/agpl-3.0.en.html](https://www.gnu.org/licenses/agpl-3.0.en.html)

A copy of the license is also included in the project's repository.

## Frequently Asked Questions

### Can I use QueryLeaf in a commercial project under the AGPL-3.0 license?

Yes, you can use QueryLeaf in a commercial project under the AGPL-3.0 license. However, if you modify QueryLeaf and your application is accessed over a network, you must make your entire application's source code available to users of your application. If this is not acceptable for your commercial project, you should consider the Commercial License.

### Do I need to release my entire application's source code if I use QueryLeaf under AGPL-3.0?

If your application interacts with users over a network and you've modified QueryLeaf, then yes, you must make your entire application's source code available to those users. If you're using QueryLeaf without modifications, you only need to provide a copy of QueryLeaf's source code.

### What constitutes a "modification" to QueryLeaf?

A modification includes any changes to the source code of QueryLeaf itself. Simply using QueryLeaf's API as a library without changing its internal code is not considered a modification.

### How can I comply with the AGPL-3.0 if I use QueryLeaf?

To comply with AGPL-3.0:

1. Include a copy of the AGPL-3.0 license in your application
2. Acknowledge the use of QueryLeaf in your application
3. Provide a way for users to access the source code of QueryLeaf and any modifications you've made
4. If you've modified QueryLeaf and your application is accessed over a network, make your application's source code available

### Can I use QueryLeaf in an internal application under AGPL-3.0?

Yes, if the application is truly internal and not accessible to external users over a network, you can use QueryLeaf under AGPL-3.0 without making your source code available to the public. However, you must still provide the source code to anyone who uses your application internally.

## Further Questions

If you have any questions about licensing, please contact [info@queryleaf.com](mailto:info@queryleaf.com).