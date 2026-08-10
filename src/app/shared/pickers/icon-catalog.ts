import { provideIcons } from '@ng-icons/core';
import {
  lucideBaby,
  lucideBanknote,
  lucideBike,
  lucideBookOpen,
  lucideBriefcase,
  lucideBuilding2,
  lucideBus,
  lucideCalculator,
  lucideCar,
  lucideCat,
  lucideChartLine,
  lucideCircleDollarSign,
  lucideCoffee,
  lucideCoins,
  lucideCreditCard,
  lucideDog,
  lucideDroplet,
  lucideDumbbell,
  lucideEuro,
  lucideFilm,
  lucideFlame,
  lucideFuel,
  lucideGamepad2,
  lucideGift,
  lucideGraduationCap,
  lucideHammer,
  lucideHeart,
  lucideHeartPulse,
  lucideHouse,
  lucideLandmark,
  lucideLaptop,
  lucideLeaf,
  lucideMapPin,
  lucideMusic,
  lucidePackage,
  lucidePaintbrush,
  lucidePhone,
  lucidePiggyBank,
  lucidePill,
  lucidePlane,
  lucideReceipt,
  lucideScissors,
  lucideSchool,
  lucideShirt,
  lucideShoppingBag,
  lucideShoppingCart,
  lucideSmartphone,
  lucideSprout,
  lucideStar,
  lucideStethoscope,
  lucideSun,
  lucideTag,
  lucideTicket,
  lucideTrain,
  lucideTrees,
  lucideTrendingUp,
  lucideTrophy,
  lucideUmbrella,
  lucideUtensils,
  lucideVault,
  lucideWallet,
  lucideWifi,
  lucideWine,
  lucideWrench,
  lucideZap,
} from '@ng-icons/lucide';

export interface CatalogIcon {
  /** ng-icons name (e.g. `lucideWallet`) — the value persisted on the entity. */
  readonly name: string;
  /** The icon's SVG source, registered with ng-icons by `provideCatalogIcons`. */
  readonly svg: string;
  /** French search terms, matched by `searchIcons` alongside the name. */
  readonly keywords: readonly string[];
}

/**
 * The icons offered anywhere the app asks a user to pick one — accounts
 * today, categories next. A hand-curated slice of Lucide rather than the
 * whole 1900-icon library: only these get bundled, and only these carry the
 * French keywords the search box needs.
 */
export const ICON_CATALOG: readonly CatalogIcon[] = [
  { name: 'lucideWallet', svg: lucideWallet, keywords: ['portefeuille', 'argent', 'compte'] },
  { name: 'lucideLandmark', svg: lucideLandmark, keywords: ['banque', 'compte courant'] },
  { name: 'lucidePiggyBank', svg: lucidePiggyBank, keywords: ['épargne', 'livret', 'économies'] },
  { name: 'lucideCreditCard', svg: lucideCreditCard, keywords: ['carte', 'bancaire', 'paiement'] },
  { name: 'lucideBanknote', svg: lucideBanknote, keywords: ['billet', 'espèces', 'liquide'] },
  { name: 'lucideCoins', svg: lucideCoins, keywords: ['pièces', 'monnaie', 'argent'] },
  { name: 'lucideVault', svg: lucideVault, keywords: ['coffre', 'coffre-fort', 'épargne'] },
  {
    name: 'lucideCircleDollarSign',
    svg: lucideCircleDollarSign,
    keywords: ['argent', 'devise', 'dollar'],
  },
  { name: 'lucideEuro', svg: lucideEuro, keywords: ['euro', 'devise', 'monnaie'] },
  {
    name: 'lucideCalculator',
    svg: lucideCalculator,
    keywords: ['calcul', 'budget', 'comptabilité'],
  },
  { name: 'lucideReceipt', svg: lucideReceipt, keywords: ['reçu', 'facture', 'ticket'] },
  {
    name: 'lucideTrendingUp',
    svg: lucideTrendingUp,
    keywords: ['investissement', 'bourse', 'placement'],
  },
  {
    name: 'lucideChartLine',
    svg: lucideChartLine,
    keywords: ['statistiques', 'graphique', 'évolution'],
  },
  {
    name: 'lucideBriefcase',
    svg: lucideBriefcase,
    keywords: ['travail', 'salaire', 'professionnel'],
  },
  { name: 'lucideHouse', svg: lucideHouse, keywords: ['maison', 'logement', 'loyer'] },
  { name: 'lucideBuilding2', svg: lucideBuilding2, keywords: ['immeuble', 'entreprise', 'bureau'] },
  { name: 'lucideSchool', svg: lucideSchool, keywords: ['école', 'scolarité', 'cantine'] },
  {
    name: 'lucideGraduationCap',
    svg: lucideGraduationCap,
    keywords: ['études', 'diplôme', 'université'],
  },
  { name: 'lucideCar', svg: lucideCar, keywords: ['voiture', 'auto', 'transport'] },
  { name: 'lucideFuel', svg: lucideFuel, keywords: ['carburant', 'essence', 'station'] },
  { name: 'lucideBus', svg: lucideBus, keywords: ['bus', 'transport', 'abonnement'] },
  { name: 'lucideTrain', svg: lucideTrain, keywords: ['train', 'transport', 'voyage'] },
  { name: 'lucideBike', svg: lucideBike, keywords: ['vélo', 'bicyclette', 'transport'] },
  { name: 'lucidePlane', svg: lucidePlane, keywords: ['avion', 'voyage', 'vacances'] },
  { name: 'lucideMapPin', svg: lucideMapPin, keywords: ['lieu', 'adresse', 'déplacement'] },
  {
    name: 'lucideShoppingCart',
    svg: lucideShoppingCart,
    keywords: ['courses', 'supermarché', 'achats'],
  },
  {
    name: 'lucideShoppingBag',
    svg: lucideShoppingBag,
    keywords: ['achats', 'shopping', 'boutique'],
  },
  { name: 'lucidePackage', svg: lucidePackage, keywords: ['colis', 'livraison', 'commande'] },
  { name: 'lucideUtensils', svg: lucideUtensils, keywords: ['restaurant', 'repas', 'nourriture'] },
  { name: 'lucideCoffee', svg: lucideCoffee, keywords: ['café', 'bar', 'boisson'] },
  { name: 'lucideWine', svg: lucideWine, keywords: ['vin', 'alcool', 'sortie'] },
  { name: 'lucideShirt', svg: lucideShirt, keywords: ['vêtements', 'habillement', 'mode'] },
  { name: 'lucideScissors', svg: lucideScissors, keywords: ['coiffeur', 'beauté', 'soins'] },
  {
    name: 'lucideStethoscope',
    svg: lucideStethoscope,
    keywords: ['santé', 'médecin', 'consultation'],
  },
  { name: 'lucidePill', svg: lucidePill, keywords: ['pharmacie', 'médicaments', 'santé'] },
  { name: 'lucideHeartPulse', svg: lucideHeartPulse, keywords: ['santé', 'mutuelle', 'assurance'] },
  { name: 'lucideDumbbell', svg: lucideDumbbell, keywords: ['sport', 'musculation', 'fitness'] },
  { name: 'lucideTrophy', svg: lucideTrophy, keywords: ['sport', 'compétition', 'club'] },
  { name: 'lucideGamepad2', svg: lucideGamepad2, keywords: ['jeux', 'jeux vidéo', 'loisirs'] },
  { name: 'lucideMusic', svg: lucideMusic, keywords: ['musique', 'concert', 'abonnement'] },
  { name: 'lucideFilm', svg: lucideFilm, keywords: ['cinéma', 'film', 'streaming'] },
  { name: 'lucideTicket', svg: lucideTicket, keywords: ['billet', 'spectacle', 'sortie'] },
  { name: 'lucideBookOpen', svg: lucideBookOpen, keywords: ['livre', 'lecture', 'culture'] },
  { name: 'lucideGift', svg: lucideGift, keywords: ['cadeau', 'anniversaire', 'fête'] },
  { name: 'lucideBaby', svg: lucideBaby, keywords: ['enfant', 'bébé', 'famille'] },
  { name: 'lucideDog', svg: lucideDog, keywords: ['chien', 'animal', 'animaux'] },
  { name: 'lucideCat', svg: lucideCat, keywords: ['chat', 'animal', 'animaux'] },
  { name: 'lucideSprout', svg: lucideSprout, keywords: ['jardin', 'plantes', 'jardinage'] },
  { name: 'lucideTrees', svg: lucideTrees, keywords: ['nature', 'extérieur', 'jardin'] },
  { name: 'lucideLeaf', svg: lucideLeaf, keywords: ['écologie', 'nature', 'vert'] },
  { name: 'lucideZap', svg: lucideZap, keywords: ['électricité', 'énergie', 'facture'] },
  { name: 'lucideDroplet', svg: lucideDroplet, keywords: ['eau', 'facture', 'énergie'] },
  { name: 'lucideFlame', svg: lucideFlame, keywords: ['gaz', 'chauffage', 'énergie'] },
  { name: 'lucideWifi', svg: lucideWifi, keywords: ['internet', 'box', 'abonnement'] },
  { name: 'lucideSmartphone', svg: lucideSmartphone, keywords: ['téléphone', 'mobile', 'forfait'] },
  { name: 'lucidePhone', svg: lucidePhone, keywords: ['téléphone', 'fixe', 'abonnement'] },
  { name: 'lucideLaptop', svg: lucideLaptop, keywords: ['informatique', 'ordinateur', 'matériel'] },
  { name: 'lucideWrench', svg: lucideWrench, keywords: ['réparation', 'entretien', 'bricolage'] },
  { name: 'lucideHammer', svg: lucideHammer, keywords: ['travaux', 'bricolage', 'réparation'] },
  {
    name: 'lucidePaintbrush',
    svg: lucidePaintbrush,
    keywords: ['décoration', 'peinture', 'travaux'],
  },
  {
    name: 'lucideUmbrella',
    svg: lucideUmbrella,
    keywords: ['assurance', 'prévoyance', 'protection'],
  },
  { name: 'lucideSun', svg: lucideSun, keywords: ['vacances', 'été', 'loisirs'] },
  { name: 'lucideStar', svg: lucideStar, keywords: ['favori', 'important', 'divers'] },
  { name: 'lucideHeart', svg: lucideHeart, keywords: ['don', 'association', 'favori'] },
  { name: 'lucideTag', svg: lucideTag, keywords: ['étiquette', 'divers', 'autre'] },
];

/** What a create form starts on before the user picks anything. */
export const DEFAULT_ICON_NAME = 'lucideWallet';

/**
 * Registers every catalogue icon with ng-icons. Add to the `providers` of any
 * component that renders a user-chosen icon — the picker does this itself,
 * but so must whatever displays the result (account cards, category rows).
 */
export function provideCatalogIcons() {
  return provideIcons(Object.fromEntries(ICON_CATALOG.map((icon) => [icon.name, icon.svg])));
}

/**
 * Strips accents and case so `epargne`, `Épargne` and `ÉPARGNE` all match the
 * same keyword — French keywords are unusable in a search box otherwise.
 */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The catalogue filtered by `query`, matched against each icon's keywords and
 * against its name minus the `lucide` prefix (so "wallet" finds
 * `lucideWallet`). A blank query returns the whole catalogue.
 */
export function searchIcons(query: string): readonly CatalogIcon[] {
  const needle = normalize(query.trim());
  if (needle === '') {
    return ICON_CATALOG;
  }

  return ICON_CATALOG.filter(
    (icon) =>
      normalize(icon.name.replace(/^lucide/, '')).includes(needle) ||
      icon.keywords.some((keyword) => normalize(keyword).includes(needle)),
  );
}
