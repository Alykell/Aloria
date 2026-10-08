package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.LegacyOptions;
import net.minecraft.client.settings.GameSettings;
import net.minecraft.client.settings.KeyBinding;
import org.apache.commons.lang3.ArrayUtils;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.io.File;

/** Ajoute la touche du menu Aloria HUD aux contrôles, avant la lecture d'options.txt (pour garder son réglage). */
@Mixin(GameSettings.class)
public class GameOptionsMixin {
	@Shadow
	public KeyBinding[] keyBindings;
	@Shadow
	private File optionsFile;

	/** Réglages des versions récentes (FOV dynamique, bascules, entrée brute) : la 1.8.9 ne les lit pas */
	@Inject(method = "loadOptions", at = @At("TAIL"))
	private void aloriahud$loadExtra(CallbackInfo ci) {
		LegacyOptions.load(optionsFile);
	}

	/** … ni ne les écrit : on les ajoute après son enregistrement, pour qu'ils restent dans options.txt */
	@Inject(method = "saveOptions", at = @At("TAIL"))
	private void aloriahud$saveExtra(CallbackInfo ci) {
		LegacyOptions.append(optionsFile);
	}

	/** Avant la lecture d'options.txt (appelée par le constructeur) : Mixin 0.7 n'injecte pas au milieu d'un constructeur */
	@Inject(method = "loadOptions", at = @At("HEAD"))
	private void aloriahud$addKey(CallbackInfo ci) {
		if (!ArrayUtils.contains(keyBindings, AloriaHud.EDITOR_KEY)) keyBindings = ArrayUtils.add(keyBindings, AloriaHud.EDITOR_KEY);
	}
}
