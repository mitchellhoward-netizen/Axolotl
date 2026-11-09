# Trellis take-home prototype

A single static page served by `serve`. It is kept out of search engines three ways: a `noindex` meta tag,
an `X-Robots-Tag` header on every response (`serve.json`), and `robots.txt`.

Deploy on Railway as its own service: New → GitHub repo → this repo → Settings → Root Directory
`trellis-prototype` → Networking → Generate Domain.
