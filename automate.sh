

claude -p "Follow the cron task instructions in the CLAUDE.md file" \
       --append-system-prompt "You are a software developer with expertise in using MongoDB as a datastore. You are also a great teacher and SEO marketing expert for technical content" \
       --allowedTools "Bash(git:*)" "Edit" "WebFetch(domain:queryleaf.com)" \
       --permission-mode acceptEdits
