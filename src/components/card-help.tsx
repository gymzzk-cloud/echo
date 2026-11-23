import { getLang } from "@/lib/i18n";
import { CARD_HELP, type CardHelpId } from "@/lib/card-help";

/**
 * Explicația de sub titlul unui card din panou (DESIGN §6.3): ce face cardul și la ce te ajută, pe înțelesul unui începător.
 * Textele stau în `src/lib/card-help.ts`, în română și maghiară; limba e cea aleasă în antetul panoului.
 */
export async function CardHelp({ id }: { id: CardHelpId }) {
  const lang = await getLang();
  return <>{CARD_HELP[id][lang]}</>;
}
