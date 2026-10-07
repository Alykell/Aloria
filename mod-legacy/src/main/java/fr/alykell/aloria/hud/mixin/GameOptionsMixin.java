package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.LegacyOptions;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.option.KeyBinding;
import org.apache.commons.lang3.ArrayUtils;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.io.File;

/** Ajoute la touche du menu Aloria HUD aux contrôles, avant la lecture d'options.txt (pour garder son réglage). */
@Mixin(GameOptions.class)
public class GameOptionsMixin {
	@Shadow
	public KeyBinding[] allKeys;

	@Shadow
	private File optionsFile;

	/** Réglages des versions récentes (FOV dynamique, bascules, entrée brute) : la 1.8.9 ne les lit pas */
	@Inject(method = "load", at = @At("TAIL"))
	private void aloriahud$loadExtra(CallbackInfo ci) {
		LegacyOptions.load(optionsFile);
	}

	/** … ni ne les écrit : on les ajoute après son enregistrement, pour qu'ils restent dans options.txt */
	@Inject(method = "save", at = @At("TAIL"))
	private void aloriahud$saveExtra(CallbackInfo ci) {
		LegacyOptions.append(optionsFile);
	}

	@Inject(method = "<init>(Lnet/minecraft/client/MinecraftClient;Ljava/io/File;)V",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/option/GameOptions;load()V"))
	private void aloriahud$addKey(MinecraftClient client, File dir, CallbackInfo ci) {
		allKeys = ArrayUtils.add(allKeys, AloriaHud.EDITOR_KEY);
	}
}
