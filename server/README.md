---
title: Partitura OMR
emoji: 🎼
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: agpl-3.0
---

Servidor gratuito de leitura de partituras por foto para o app **Do Áudio à Partitura**.
Usa o [homr](https://github.com/liebharc/homr) (AGPL-3.0). Recebe uma imagem em `POST /read`
e devolve `{"musicxml": "..."}`.
