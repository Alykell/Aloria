package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.renderer.EntityRenderer;
import net.minecraft.client.settings.GameSettings;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * Écran Visuel : luminosité max et brouillard. OptiFine réécrit une partie de ce rendu : sans prise, l'effet est
 * simplement absent (require = 0) au lieu d'empêcher le jeu de démarrer.
 */
@Mixin(EntityRenderer.class)
public class VisualRendererMixin {
	@Shadow
	private float farPlaneDistance;

	@Redirect(method = "updateLightmap", at = @At(value = "FIELD", target = "Lnet/minecraft/client/settings/GameSettings;gammaSetting:F"), require = 0)
	private float aloriahud$fullbright(GameSettings settings) {
		return Visual.gamma(settings.gammaSetting);
	}

	@ModifyArg(method = "setupFog", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GlStateManager;setFogStart(F)V"), require = 0)
	private float aloriahud$fogStart(float start) {
		return Visual.linearFog(start, farPlaneDistance);
	}

	@ModifyArg(method = "setupFog", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GlStateManager;setFogEnd(F)V"), require = 0)
	private float aloriahud$fogEnd(float end) {
		return Visual.linearFog(end, farPlaneDistance);
	}

	@ModifyArg(method = "setupFog", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GlStateManager;setFogDensity(F)V"), require = 0)
	private float aloriahud$fogDensity(float density) {
		return Visual.densityFog(density, farPlaneDistance);
	}
}
