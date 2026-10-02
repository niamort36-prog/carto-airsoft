/**
 * Demander un nom sans laisser l'utilisateur dans le noir.
 *
 * `prompt` renvoie `null` quand on annule, et une chaîne vide ou trop
 * courte quand on valide sans taper ce qu'il faut. Dans le code les deux se
 * ressemblent — un `return` — mais pas pour celui qui clique : annuler est
 * un choix, alors que taper « Op » et ne rien voir se produire ressemble à
 * un bouton cassé. C'est précisément la panne qui a été signalée.
 *
 * On redemande donc, en disant la contrainte, et on ne renvoie `null` que
 * sur une vraie annulation.
 */
export function demanderNom(
  question: string,
  defaut: string,
  minimum = 1,
): string | null {
  let propose = defaut;
  let rappel = '';
  for (;;) {
    const saisi = prompt(rappel ? `${rappel}\n\n${question}` : question, propose);
    if (saisi == null) return null; // Annulation : le silence est voulu.
    const propre = saisi.trim();
    if (propre.length >= minimum) return propre;
    propose = propre;
    rappel =
      minimum === 1
        ? 'Il faut un nom.'
        : `Il faut au moins ${minimum} caractères (${propre.length} saisi${
            propre.length > 1 ? 's' : ''
          }).`;
  }
}
