# Controle de Gestão — acesso por empresa

Painel financeiro com login de equipe e clientes. A equipe de BPO cadastra as empresas e importa as planilhas; cada usuário cliente só consulta os dados da empresa vinculada. O painel usa Supabase Auth e PostgreSQL com Row Level Security (RLS). O HTML pode ser publicado no GitHub Pages, mas autenticação e dados ficam no Supabase.

## Configuração inicial

1. Crie um projeto no Supabase e abra o **SQL Editor**. Execute todo o conteúdo de `schema.sql`.
2. Em **Authentication → Sign In / Providers**, mantenha habilitado o login por e-mail/senha e desabilite o cadastro público de usuários (sign-ups). Não exponha cadastro aberto.
3. Crie o usuário interno da equipe em **Authentication → Users → Add user**. Copie o UUID e execute no SQL Editor o `INSERT` de exemplo comentado no final de `schema.sql`, substituindo o UUID. Isso concede o papel `staff`.
4. Em **Project Settings → API**, copie a **Project URL** e a chave pública **anon/publishable**. No `index.html`, substitua `COLE_A_URL_DO_PROJETO_SUPABASE` e `COLE_A_CHAVE_PUBLICA_ANON_DO_SUPABASE`.
5. Publique `index.html` no GitHub Pages com acesso HTTPS. Não publique planilhas, senhas, chaves secretas ou dados financeiros no GitHub.

A chave `anon`/publishable foi feita para uso no navegador: a proteção dos registros é feita pelas políticas RLS do banco. **Nunca coloque a `service_role`/secret key no HTML, no GitHub ou no navegador.** Revise e teste as regras antes de carregar dados reais.

## Cadastrar empresa e liberar cliente

1. No Supabase, a equipe cria o usuário do cliente em **Authentication → Users → Add user**. Informe e-mail e senha inicial, confirme o e-mail conforme a configuração do projeto e forneça a senha ao cliente por canal seguro.
2. O usuário interno entra no painel, cadastra a empresa e copia o UUID do usuário cliente do Supabase para vinculá-lo à empresa selecionada.
3. Selecione a empresa no painel e importe a planilha Excel `.xlsx`, `.xls` ou `.xlsm`. A planilha é processada e os dados estruturados são gravados no banco associado àquela empresa.
4. O cliente entra com seu e-mail e senha e visualiza somente o painel da empresa vinculada. Para usuários adicionais da mesma empresa, crie a conta no Supabase e vincule cada UUID à mesma empresa.

A equipe pode substituir os dados importando uma planilha atualizada para a empresa selecionada. As abas esperadas são `Lançamentos`, `Lançamentos Projetados`, `Controle_Comissões_V2` e `Repasses_Comissões`, com os cabeçalhos utilizados pelo painel. Os saldos diários cadastrados pela tela **Saldos diários** são preservados quando a planilha é atualizada.

## Controles de acesso e limites

- As políticas RLS restringem leituras e gravações por empresa no banco; esconder botões no navegador não é a barreira de segurança.
- Apenas perfis internos com papel `staff`, definidos pelo operador no banco, podem cadastrar empresas, vincular clientes e gravar planilhas.
- Clientes têm acesso de consulta. O projeto não inclui recuperação de senha personalizada; a equipe pode redefinir credenciais pelo Supabase.
- O painel carrega Supabase JS, SheetJS, Chart.js, html2canvas e jsPDF por CDNs; precisa de internet. Dados financeiros trafegam entre o navegador autenticado e o Supabase.
- Antes de usar em produção, teste com duas empresas e contas de cliente separadas, valide backup, política de privacidade, contratos e obrigações da LGPD. Ative MFA para as contas internas e use senhas fortes.

Para exportar a tela atual, clique em **Exportar PDF da tela**. Para cadastrar mais membros da equipe, crie suas contas e atribua papel `staff` pelo SQL Editor; não permita que o usuário altere o próprio papel.
