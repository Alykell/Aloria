package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.G;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.Tr;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.resource.language.I18n;
import net.minecraft.entity.effect.StatusEffect;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.List;

/** Effets actifs façon inventaire : icône de l'effet, nom avec niveau, temps restant. */
public final class EffectsModule extends HudModule {
	private static final Identifier INVENTORY = new Identifier("textures/gui/container/inventory.png");
	private static final String[] ROMAN = {"", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"};
	private static final int PAD = 4;
	private static final int ICON = 18;
	private static final int ROW = 22;

	private static final class Row {
		final StatusEffect effect;
		final String name;
		final String duration;

		Row(StatusEffect effect, String name, String duration) {
			this.effect = effect;
			this.name = name;
			this.duration = duration;
		}
	}

	public EffectsModule() {
		super("effects");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0f, 0.3f);
	}

	@Override
	public String hint() {
		return Tr.tr("hint.effects");
	}

	@Override
	public String category() {
		return "pvp";
	}

	@Override
	public boolean hasContent(MinecraftClient mc) {
		return mc.player != null && !mc.player.getStatusEffectInstances().isEmpty();
	}

	private static String duration(StatusEffectInstance effect) {
		if (effect.isPermanent()) return "∞";
		int seconds = effect.getDuration() / 20;
		return String.format("%d:%02d", seconds / 60, seconds % 60);
	}

	private static String name(StatusEffect effect, int amplifier) {
		// Le serveur l'envoie sur un octet signé : un niveau > 128 (souvent donné par les serveurs PvP) arrive négatif
		amplifier &= 0xFF;
		return I18n.translate(effect.getTranslationKey()) + (amplifier < ROMAN.length ? ROMAN[amplifier] : " " + (amplifier + 1));
	}

	private static List<Row> rows(MinecraftClient mc, boolean preview) {
		List<Row> rows = new ArrayList<>();
		if (mc.player != null) {
			for (StatusEffectInstance effect : mc.player.getStatusEffectInstances()) {
				StatusEffect type = StatusEffect.STATUS_EFFECTS[effect.getEffectId()];
				if (type != null) rows.add(new Row(type, name(type, effect.getAmplifier()), duration(effect)));
			}
		}
		if (rows.isEmpty() && preview) {
			rows.add(new Row(StatusEffect.SPEED, name(StatusEffect.SPEED, 1), "1:30"));
			rows.add(new Row(StatusEffect.STRENGTH, name(StatusEffect.STRENGTH, 0), "0:45"));
		}
		return rows;
	}

	@Override
	public int width(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		int text = 0;
		for (Row row : rows(mc, preview)) text = Math.max(text, Math.max(g.textWidth(row.name), g.textWidth(row.duration)));
		return PAD * 2 + ICON + 5 + text;
	}

	@Override
	public int height(MinecraftClient mc, G g, ModuleSettings s, boolean preview) {
		return Math.max(1, rows(mc, preview).size()) * ROW - 4 + PAD * 2;
	}

	@Override
	public void draw(G g, MinecraftClient mc, ModuleSettings s, boolean preview) {
		Draw.panel(g, 0, 0, width(mc, g, s, preview), height(mc, g, s, preview), s);
		int y = PAD;
		for (Row row : rows(mc, preview)) {
			if (row.effect.hasIcon()) {
				// Icônes de l'inventaire : 8 par ligne, 18 × 18, à partir de (0, 198)
				int index = row.effect.getIconLevel();
				g.texture(INVENTORY, PAD, y, index % 8 * 18, 198 + index / 8 * 18, ICON, ICON, 1f);
			}
			g.text(row.name, PAD + ICON + 5, y, Draw.textColor(s), s.shadow);
			g.text(row.duration, PAD + ICON + 5, y + 9, Theme.WHITE, s.shadow);
			y += ROW;
		}
	}
}
