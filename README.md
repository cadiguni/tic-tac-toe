# 🕹️ Jogo da Velha Online com Node.js e Socket.IO

Um jogo da velha multiplayer em tempo real, utilizando Node.js, Express e Socket.IO. Dois jogadores podem se conectar, jogar e reiniciar a partida diretamente pelo navegador.

## 🚀 Tecnologias Utilizadas

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- HTML, CSS e JavaScript (lado cliente)

## 📁 Estrutura do Projeto
```bash
jogo-da-velha/
├── public/
│ ├── index.html # Interface do jogo
│ ├── style.css # Estilo do jogo
│ └── script.js # Lógica do cliente (comunicação e jogadas)
│
├── server.js # Servidor Node.js com lógica do jogo
└── README.md # Documentação do projeto
```

---

## ▶️ Como Executar o Projeto

1. Clone o repositório:

   ```bash
   git clone https://github.com/seu-usuario/jogo-da-velha.git
   cd jogo-da-velha
   ```

2. Instale as dependências:

    ```bash
    npm install
    ```

3. Inicie o servidor:
 
    ```bash
    node server.js
    ```

4. Abra dois navegadores (ou abas) e acesse:
    ```bash
    http://localhost:3000
    ```
---
## 💡 Funcionalidades

    Atribuição automática de símbolos (X e O)

    Jogo em tempo real entre dois jogadores

    Detecção de vitória ou empate

    Reinício automático após vitória

    Botão de reiniciar manual

📄 Licença

Este projeto está licenciado sob a MIT License.