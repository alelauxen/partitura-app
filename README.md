# 🎼 Do Áudio à Partitura

App para **gravar, transcrever, fotografar e editar partituras**, direto no celular.

**Abrir o app:** https://alelauxen.github.io/partitura-app/
No Android, abra no Chrome e toque em **⋮ → Adicionar à tela inicial** para instalar.

## O que faz
- 🎙️ **Gravar** pelo microfone e transformar em partitura (reconhecimento de notas no próprio aparelho, sem internet).
- 🎵 **Importar áudio ou vídeo** (MP3, M4A, WAV, MP4).
- 📷 **Ler foto de partitura** pelo servidor gratuito (pasta `server/`, usa o [homr](https://github.com/liebharc/homr)).
- 📝 **Editor** com clave de sol e de fá (piano), tom por nome ou armadura, durações, pausas, ligaduras, notas duplas, cifra, letra, desfazer/refazer e atalhos de teclado no estilo dos editores profissionais.
- ▶️ **Tocar** com BPM ajustável e a nota acesa enquanto toca.
- 💾 Salvar/abrir arquivos e exportar/importar **MusicXML** (MuseScore, Audiveris…).

## Servidor de leitura de foto (Hugging Face, gratuito)
1. No Hugging Face: **Settings → Access Tokens → Create new token**, tipo **Write**. Copie o token.
2. Aqui no GitHub: **Settings → Secrets and variables → Actions → New repository secret**,
   nome `HF_TOKEN`, valor = o token.
3. Em **Actions → "Publicar servidor de leitura de foto" → Run workflow**.
4. O resumo da execução mostra o endereço do servidor. Cole no app em **📷 Ler foto → ⚙️ Endereço do servidor**.

O servidor gratuito "dorma" depois de um tempo sem uso; a primeira leitura depois disso demora 1–2 minutos.

## Créditos
[VexFlow](https://www.vexflow.com/) (desenho da partitura) · [Basic Pitch](https://github.com/spotify/basic-pitch) (notas a partir do áudio) · [homr](https://github.com/liebharc/homr) (leitura de foto).
