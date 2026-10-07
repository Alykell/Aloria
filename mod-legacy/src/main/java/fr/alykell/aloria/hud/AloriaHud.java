package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.HudConfig;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.module.Modules;
import fr.alykell.aloria.hud.screen.HudMenuScreen;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.lwjgl.input.Keyboard;

import java.util.List;

/** Aloria HUD pour la 1.8.9 (Legacy Fabric) : tout passe par des mixins, sans Fabric API. */
public class AloriaHud implements ClientModInitializer {
	public static final String MOD_ID = "aloriahud";
	public static final Logger LOGGER = LogManager.getLogger("Aloria HUD");

	private static final List<HudModule> MODULES = Modules.all();
	/** Maj droite ouvre le menu, comme sur Lunar / Feather (modifiable dans les contrôles) */
	public static final KeyBinding EDITOR_KEY = new KeyBinding("key.aloriahud.editor", Keyboard.KEY_RSHIFT, "key.categories.aloriahud");
	private static HudConfig config;

	public static List<HudModule> modules() {
		return MODULES;
	}

	public static HudConfig config() {
		return config;
	}

	@Override
	public void onInitializeClient() {
		config = HudConfig.load(MODULES);
		if (SelfTest.enabled()) SelfTest.init();
		LOGGER.info("Aloria HUD prêt ({} modules, réglages : {})", MODULES.size(), HudConfig.file());
	}

	/** Fin de chaque tick du jeu (MinecraftClientMixin) */
	public static void tick(MinecraftClient mc) {
		Stats.tick(mc);
		if (SelfTest.enabled()) SelfTest.tick(mc);
		while (EDITOR_KEY.wasPressed()) {
			if (mc.currentScreen == null && mc.player != null) mc.setScreen(new HudMenuScreen(null));
		}
	}
}
