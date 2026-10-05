package fr.alykell.aloria.hud.module;

import fr.alykell.aloria.hud.config.ModuleSettings;
import net.minecraft.client.Minecraft;
import net.minecraft.world.effect.MobEffectInstance;

import java.util.ArrayList;
import java.util.List;

/** Effets de potion actifs, avec niveau et temps restant. */
public final class EffectsModule extends TextModule {
	private static final String[] ROMAN = {"", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"};

	public EffectsModule() {
		super("effects", "Effets");
	}

	@Override
	public ModuleSettings defaults() {
		return new ModuleSettings(true, 0.01f, 0.3f);
	}

	private static String duration(MobEffectInstance effect) {
		if (effect.isInfiniteDuration()) return "∞";
		int seconds = effect.getDuration() / 20;
		return String.format("%d:%02d", seconds / 60, seconds % 60);
	}

	@Override
	public boolean hasContent(Minecraft mc) {
		return mc.player != null && !mc.player.getActiveEffects().isEmpty();
	}

	@Override
	protected List<Line> lines(Minecraft mc, boolean preview) {
		List<Line> lines = new ArrayList<>();
		if (mc.player != null) {
			for (MobEffectInstance effect : mc.player.getActiveEffects()) {
				int amp = effect.getAmplifier();
				String name = effect.getEffect().value().getDisplayName().getString() + (amp < ROMAN.length ? ROMAN[amp] : " " + (amp + 1));
				lines.add(new Line(name, duration(effect)));
			}
		}
		if (lines.isEmpty() && preview) {
			lines.add(new Line("Vitesse II", "1:30"));
			lines.add(new Line("Force", "0:45"));
		}
		return lines;
	}
}
