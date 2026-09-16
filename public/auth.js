/**
 * Cliente de autenticação, compartilhado pela home e pela sala.
 *
 * A sessão vive num cookie httpOnly — este arquivo nunca vê nem guarda token.
 * Tudo que ele faz é chamar /api e perguntar "quem sou eu".
 */

const Auth = (() => {
  async function chamar(rota, opcoes = {}) {
    const resposta = await fetch(rota, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes
    });

    let corpo = {};
    try {
      corpo = await resposta.json();
    } catch {
      // resposta sem JSON (erro de proxy, HTML de erro, etc.)
    }

    if (!resposta.ok) {
      throw new Error(corpo.erro || 'Não foi possível completar a operação.');
    }

    return corpo;
  }

  const sessao = () => chamar('/api/eu').then(r => r.usuario).catch(() => null);
  const login = (usuario, senha) =>
    chamar('/api/login', { method: 'POST', body: JSON.stringify({ usuario, senha }) }).then(r => r.usuario);
  const registrar = (usuario, senha) =>
    chamar('/api/registrar', { method: 'POST', body: JSON.stringify({ usuario, senha }) }).then(r => r.usuario);
  const logout = () => chamar('/api/logout', { method: 'POST' });

  /**
   * Monta o formulário de entrar/criar conta dentro de `container`.
   * Chama `aoAutenticar(usuario)` quando dá certo.
   */
  function montarFormulario(container, aoAutenticar) {
    let modoCadastro = false;

    const form = document.createElement('form');
    form.className = 'auth-form';
    form.noValidate = true;

    const campoUsuario = document.createElement('input');
    campoUsuario.type = 'text';
    campoUsuario.placeholder = 'Usuário';
    campoUsuario.autocomplete = 'username';
    campoUsuario.maxLength = 20;

    const campoSenha = document.createElement('input');
    campoSenha.type = 'password';
    campoSenha.placeholder = 'Senha';
    campoSenha.autocomplete = 'current-password';
    campoSenha.maxLength = 128;

    const botao = document.createElement('button');
    botao.type = 'submit';
    botao.className = 'btn btn-primary';

    const alternar = document.createElement('button');
    alternar.type = 'button';
    alternar.className = 'auth-link';

    const erro = document.createElement('p');
    erro.className = 'auth-erro';
    erro.hidden = true;

    function aplicarModo() {
      botao.textContent = modoCadastro ? 'Criar conta' : 'Entrar';
      alternar.textContent = modoCadastro
        ? 'Já tenho conta'
        : 'Não tenho conta — quero criar';
      campoSenha.autocomplete = modoCadastro ? 'new-password' : 'current-password';
      erro.hidden = true;
    }

    alternar.addEventListener('click', () => {
      modoCadastro = !modoCadastro;
      aplicarModo();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      erro.hidden = true;
      botao.disabled = true;

      try {
        const acao = modoCadastro ? registrar : login;
        const usuario = await acao(campoUsuario.value.trim(), campoSenha.value);
        aoAutenticar(usuario);
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      } finally {
        botao.disabled = false;
      }
    });

    aplicarModo();
    form.append(campoUsuario, campoSenha, botao, alternar, erro);
    container.appendChild(form);

    return form;
  }

  return { sessao, login, registrar, logout, montarFormulario };
})();
