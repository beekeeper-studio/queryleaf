

claude -p "Queryleaf provides sql-for-mongodb libraries. Look at existing posts in this blog and write a new blog post you think will rank well in Google. Make sure it is not a duplicate of another post. Ensure it has the same tone and format as other posts, also make sure it links to another relevent post in a natural way. See docs/blog. Posts should be tutorials for MongoDB aimed at software engineers, in a friendly tone, no marketing fluff, should be direct and to the point. When you're done, review the post for correctness, then commit the new content and push it to the main branch." \
       --append-system-prompt "You are a MongoDB expert. You are also a SEO marketing expert for technical content" \
       --allowedTools "Bash(git:*)" "Edit" \
       --permission-mode acceptEdits
