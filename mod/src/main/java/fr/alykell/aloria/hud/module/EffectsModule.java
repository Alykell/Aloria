package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.Draw;
import fr.alykell.aloria.hud.Fonts;
import fr.alykell.aloria.hud.Theme;
import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.core.Holder;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;

import java.util.ArrayList;
import java.util.List;

/** Effets actifs façon inventaire : icône de l'effet, nom avec niveau, temps restant. */
public final class EffectsModule extends HudModule {
	private record Row(Holder<MobEffect> effect, String name, String duration) {
	}

	private static final String[] ROMAN = {"", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"};
	private static final int PAD = 4;
	private static final int ICON = 18;
	private static final int ROW = 22;

	public EffectsModule() {
		super("effects", "Effets");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(false, 0f, 0.3f);
	}

	@Override
	public String hint() {
		return "Visible quand un effet est actif";
	}

	@Override
	public String category() {
		return "pvp";
	}

	@Override
	public boolean hasContent(Minecraft mc) {
		return mc.player != null && !mc.player.getActiveEffects().isEmpty();
	}

	private static String duration(MobEffectInstance effect) {
		if (effect.isInfiniteDuration()) return "∞";
		int seconds = effect.getDuration() / 20;
		return String.format("%d:%02d", seconds / 60, seconds % 60);
	}

	private static String name(Holder<MobEffect> effect, int amplifier) {
		return effect.value().getDisplayName().getString() + (amplifier < ROMAN.length ? ROMAN[amplifier] : " " + (amplifier + 1));
	}

	private static List<Row> rows(Minecraft mc, boolean preview) {
		List<Row> rows = new ArrayList<>();
		if (mc.player != null) {
			for (MobEffectInstance effect : mc.player.getActiveEffects()) {
				rows.add(new Row(effect.getEffect(), name(effect.getEffect(), effect.getAmplifier()), duration(effect)));
			}
		}
		if (rows.isEmpty() && preview) {
			rows.add(new Row(MobEffects.SPEED, name(MobEffects.SPEED, 1), "1:30"));
			rows.add(new Row(MobEffects.STRENGTH, name(MobEffects.STRENGTH, 0), "0:45"));
		}
		return rows;
	}

	@Override
	public int width(Minecraft mc, ModuleSettings s, boolean preview) {
		int text = 0;
		for (Row row : rows(mc, preview)) text = Math.max(text, Math.max(Fonts.width(mc, row.name()), Fonts.width(mc, row.duration())));
		return PAD * 2 + ICON + 5 + text;
	}

	@Override
	public int height(Minecraft mc, ModuleSettings s, boolean preview) {
		return Math.max(1, rows(mc, preview).size()) * ROW - 4 + PAD * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, ModuleSettings s, boolean preview) {
		if (s.background) Draw.glass(g, 0, 0, width(mc, s, preview), height(mc, s, preview), s.opacity);
		int y = PAD;
		for (Row row : rows(mc, preview)) {
			g.blitSprite(RenderPipelines.GUI_TEXTURED, Hud.getMobEffectSprite(row.effect()), PAD, y, ICON, ICON);
			Fonts.draw(g, mc, row.name(), PAD + ICON + 5, y, s.color, s.shadow);
			Fonts.draw(g, mc, row.duration(), PAD + ICON + 5, y + 9, Theme.WHITE, s.shadow);
			y += ROW;
		}
	}
}
