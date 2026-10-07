package fr.alykell.aloria.hud.config;

/** Réglages de l'écran Visuel : mains, bouclier, totem, luminosité et brouillard. */
public class VisualSettings {
	/** Décalage et taille d'un objet tenu en vue à la première personne (valeurs neutres = jeu normal) */
	public static class HandTransform {
		/** Vers l'extérieur de l'écran (positif) ou vers le centre (négatif), en blocs */
		public float side;
		/** Vers le haut (positif) ou vers le bas (négatif), en blocs */
		public float height;
		/** Plus loin (positif) ou plus près (négatif), en blocs */
		public float depth;
		public float scale = 1f;

		public boolean isNeutral() {
			return side == 0 && height == 0 && depth == 0 && scale == 1f;
		}
	}

	public HandTransform mainHand = new HandTransform();
	public HandTransform offHand = new HandTransform();
	/** Le bouclier a ses propres réglages : ceux de la main qui le tient ne s'y appliquent pas */
	public HandTransform shield = new HandTransform();
	/** Taille de l'animation du totem d'immortalité */
	public float totemScale = 1f;
	/** Voir comme avec l'effet Vision nocturne */
	public boolean fullbright = false;
	/** Brouillard en pourcentage : 100 = normal, 0 = aucun */
	public int fogOverworld = 100;
	public int fogNether = 100;
	public int fogEnd = 100;
	public int fogWater = 100;
	public int fogLava = 100;
	public int fogSnow = 100;
}
