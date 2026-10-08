package fr.alykell.aloria.hud;

import fr.alykell.aloria.hud.config.HudConfig;
import fr.alykell.aloria.hud.module.HudModule;
import fr.alykell.aloria.hud.module.Modules;
import fr.alykell.aloria.hud.screen.HudMenuScreen;
//#if FORGE
//#else
import net.fabricmc.api.ClientModInitializer;
//#endif
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.lwjgl.input.Keyboard;

import java.util.List;

/**
 * Aloria HUD pour la 1.8.9 : tout passe par des mixins, sans Fabric API. Le même code sert à la version Forge
 * (mod-forge, noms convertis à la compilation) : les blocs « //#if FORGE » y sont activés.
 */
//#if FORGE
//$$ @net.minecraftforge.fml.common.Mod(modid = AloriaHud.MOD_ID, name = "Aloria HUD", version = "1", clientSideOnly = true, acceptedMinecraftVersions = "[1.8.9]")
//$$ public class AloriaHud {
//#else
public class AloriaHud implements ClientModInitializer {
//#endif
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

	//#if FORGE
	//$$ @net.minecraftforge.fml.common.Mod.EventHandler
	//$$ public void init(net.minecraftforge.fml.common.event.FMLInitializationEvent event) {
	//$$ 	onInitializeClient();
	//$$ }
	//#else
	@Override
	//#endif
	public void onInitializeClient() {
		config = HudConfig.load(MODULES);
		if (SelfTest.enabled()) SelfTest.init();
		LOGGER.info("Aloria HUD prêt ({} modules, réglages : {})", MODULES.size(), HudConfig.file());
	}

	/** Fin de chaque tick du jeu (MinecraftClientMixin) */
	public static void tick(MinecraftClient mc) {
		Stats.tick(mc);
		Toggles.tick(mc);
		// Déplacements de souris faits dans un menu : oubliés, la vue ne doit pas sauter en le fermant
		if (mc.currentScreen != null) RawInput.reset();
		if (SelfTest.enabled()) SelfTest.tick(mc);
		while (EDITOR_KEY.wasPressed()) {
			if (mc.currentScreen == null && mc.player != null) mc.setScreen(new HudMenuScreen(null));
		}
	}
}
