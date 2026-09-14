import React, { useState, useEffect } from 'react';

// Converte o arquivo de imagem escolhido em base64 (data URL) — guardamos a
// logo direto na tabela dados_empresa como texto, sem precisar configurar um
// bucket de Storage no Supabase só pra isso.
function lerImagemComoDataURL(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

// Card pra cadastrar a logo e os dados da empresa (Razão Social, CNPJ,
// Endereço, Responsável Administrativo e telefones) — usados no cabeçalho do
// sistema e nos relatórios exportados em Excel/PDF.
export default function DadosEmpresa({ dadosEmpresa, onSalvar }) {
  const [form, setForm] = useState(dadosEmpresa);
  const [erroLogo, setErroLogo] = useState('');

  // Se os dados chegarem depois (carregamento do Supabase termina depois do
  // primeiro render) ou forem salvos em outra aba, mantém o formulário
  // sincronizado — mas só enquanto ela não começou a editar nesta sessão,
  // pra não sobrescrever uma edição em andamento.
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    if (!tocado) setForm(dadosEmpresa);
  }, [dadosEmpresa, tocado]);

  const atualizar = (campo, valor) => {
    setTocado(true);
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  const escolherLogo = async (arquivo) => {
    if (!arquivo) return;
    setErroLogo('');
    if (!arquivo.type.startsWith('image/')) {
      setErroLogo('Escolha um arquivo de imagem (PNG, JPG ou similar).');
      return;
    }
    if (arquivo.size > 1.5 * 1024 * 1024) {
      setErroLogo('Essa imagem é grande demais (máx. 1,5MB) — tente uma versão menor ou mais comprimida da logo.');
      return;
    }
    const dataUrl = await lerImagemComoDataURL(arquivo);
    atualizar('logo', dataUrl);
  };

  const salvar = () => {
    setTocado(false);
    onSalvar(form);
  };

  return (
    <div className="card">
      <h3>Dados da Empresa</h3>
      <p className="nota-formato">
        Usados no cabeçalho do sistema e nos relatórios exportados (Excel e PDF).
      </p>

      <div className="dados-empresa-logo">
        {form.logo ? (
          <img src={form.logo} alt="Logo da empresa" className="logo-preview" />
        ) : (
          <div className="logo-preview logo-preview-vazia">Sem logo</div>
        )}
        <div className="input-group">
          <label>Logo</label>
          <input type="file" accept="image/*" onChange={(e) => escolherLogo(e.target.files[0])} />
          {erroLogo && <p className="erro-arquivo">{erroLogo}</p>}
          {form.logo && (
            <button onClick={() => atualizar('logo', null)} className="btn-cancelar" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              Remover logo
            </button>
          )}
        </div>
      </div>

      <div className="form-transferencia">
        <div className="input-group">
          <label>Razão Social</label>
          <input type="text" value={form.razaoSocial} onChange={(e) => atualizar('razaoSocial', e.target.value)} placeholder="Ex: Santo Barbearia Ltda" />
        </div>
        <div className="input-group">
          <label>CNPJ</label>
          <input type="text" value={form.cnpj} onChange={(e) => atualizar('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
        </div>
        <div className="input-group">
          <label>Endereço</label>
          <input type="text" value={form.endereco} onChange={(e) => atualizar('endereco', e.target.value)} placeholder="Rua, número, bairro, cidade - UF" />
        </div>
        <div className="input-group">
          <label>Responsável Adm.</label>
          <input type="text" value={form.responsavelAdm} onChange={(e) => atualizar('responsavelAdm', e.target.value)} placeholder="Nome do responsável administrativo" />
        </div>
        <div className="input-group">
          <label>Telefone Comercial</label>
          <input type="text" value={form.telefoneComercial} onChange={(e) => atualizar('telefoneComercial', e.target.value)} placeholder="(00) 0000-0000" />
        </div>
        <div className="input-group">
          <label>Telefone do Responsável</label>
          <input type="text" value={form.telefoneResponsavel} onChange={(e) => atualizar('telefoneResponsavel', e.target.value)} placeholder="(00) 00000-0000" />
        </div>
        <button onClick={salvar} className="btn-transferir">Salvar Dados da Empresa</button>
      </div>
    </div>
  );
}
