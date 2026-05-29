# GitHub Tools

Custom README and GitHub profile utilities by TEXploder.

Live site:

```text
https://gh.tex-api.com
```

This is the small utility hub I use for custom README SVGs, profile cards,
badges, social rows, terminal demos, and quick README previews. The main point
is simple: make README stuff that runs from my own domain instead of depending
on random generator links everywhere.

## Quick Preview

[![README Pulse SVG](https://gh.tex-api.com/svg/pulse?title=GitHub+Tools+by+TEXploder&subtitle=Custom+README+utilities+running+on+gh.tex-api.com&status=profile-ready&theme=liquid&primary=8d62ff&secondary=05050d&text=f5f3ff&scale=100)](https://gh.tex-api.com)

## Tools

- Pulse Banner Builder
- Repo Launch Card
- Custom Badge Studio
- Social Link Row
- Terminal Demo
- Project Timeline
- README Preview Sandbox

## Themes

The SVG tools share the same theme setup:

- `clean`
- `liquid`
- `matrix`

Each tool supports editable primary, secondary, and text colors. Most tools also
support a proportional `scale` value, so the format stays stable while the
output size changes.

## SVG Endpoints

```text
/svg/pulse
/svg/repo-card
/svg/badge
/svg/social-row
/svg/social-icon
/svg/terminal-demo
/svg/project-timeline
```

## Examples

```md
![Terminal Demo](https://gh.tex-api.com/svg/terminal-demo?theme=clean&command=npm%20install%20github-tools%0Anpm%20run%20generate&output=ready%3A%20README%20utilities%20generated&scale=100)
```

```md
![Project Timeline](https://gh.tex-api.com/svg/project-timeline?theme=liquid&title=Build%20Path&steps=Idea,Build,Preview,Ship&active=3&scale=100)
```

## Test README

There is a TEXploder-style profile test file here:

```text
README_TEXploder_TEST.md
```

It is based on my profile README style and uses the newer tools from this hub:
Pulse, Social Row, Repo Card, Badge, Terminal Demo, and Timeline.

## Privacy and Legal

- Privacy policy: `https://gh.tex-api.com/datenschutz.html`
- Imprint: `https://impressum.texploder.com`

## License

This project is licensed under `CC BY 4.0`.

You can use, copy, modify, and share it for basically any purpose, including
commercial use. Just give credit to `TEXploder`, link back to this repository
where reasonable, and keep the license notice.

## Deployment

The app is a plain Node server behind the existing server routing.

Local container service:

```text
githubtools-web
```

Restart:

```bash
docker compose restart githubtools-web
```

Basic checks:

```bash
node --check server.js
node --check public/script.js
curl https://gh.tex-api.com/healthz
```
