# 🎼 Do Áudio à Partitura

## 📱 App Android (APK)

Baixe no celular: **https://github.com/alelauxen/partitura-app/releases/download/apk/partitura.apk**

O APK é montado automaticamente pelo GitHub a cada atualização. Ele tem tudo do app web e mais o botão
**🔊 Som do celular**, que captura o áudio que está tocando no aparelho (YouTube, Spotify…) para transcrever
ou identificar a música. Requer Android 10 ou mais novo.


App para **gravar, transcrever, fotografar e editar partituras**, direto no celular.

**Abrir o app:** https://alelauxen.github.io/partitura-app/
No Android, abra no Chrome e toque em **⋮ → Adicionar à tela inicial** para instalar.

## O que faz
- 🎙️ **Gravar** pelo microfone e transformar em partitura (reconhecimento de notas no próprio aparelho, sem internet).
- 🎵 **Importar áudio ou vídeo** (MP3, M4A, WAV, MP4).
- 📷 **Leitura de foto**: feita pelo Claude; o resultado em MusicXML é importado no app. (A pasta `server/` tem um servidor homr pronto, caso um dia haja onde hospedá-lo — o Hugging Face passou a exigir assinatura PRO para isso.)
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
