const mongoose = require('mongoose');

const MIN_USUARIO = 3;
const MAX_USUARIO = 20;

// Letras, números, ponto, hífen e underscore. Sem espaço e sem acento, para que
// o login seja sempre digitável do mesmo jeito.
const FORMATO_USUARIO = /^[a-zA-Z0-9._-]+$/;

const usuarioSchema = new mongoose.Schema({
  // Chave de login, sempre em minúsculas
  usuario: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: MIN_USUARIO,
    maxlength: MAX_USUARIO,
    match: FORMATO_USUARIO
  },
  // Como o nome aparece na sala e no ranking, preservando maiúsculas
  nomeExibicao: {
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_USUARIO
  },
  senhaHash: { type: String, required: true },
  ultimoAcesso: { type: Date, default: Date.now }
}, {
  timestamps: true
});

/** Projeção segura para mandar ao cliente — nunca inclui o hash. */
usuarioSchema.methods.paraCliente = function paraCliente() {
  return {
    id: this._id.toString(),
    usuario: this.usuario,
    nomeExibicao: this.nomeExibicao
  };
};

module.exports = mongoose.model('Usuario', usuarioSchema);
module.exports.MIN_USUARIO = MIN_USUARIO;
module.exports.MAX_USUARIO = MAX_USUARIO;
module.exports.FORMATO_USUARIO = FORMATO_USUARIO;
