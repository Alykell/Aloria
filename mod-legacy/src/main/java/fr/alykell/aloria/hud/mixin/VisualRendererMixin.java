package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Écran Visuel : luminosité max (éclairage calculé comme avec une luminosité très au-dessus du maximum) et brouillard. */
@Mixin(GameRenderer.class)
public class VisualRendererMixin {
	@Shadow
	private float viewDistance;

	@Redirect(method = "updateLightmap", at = @At(value = "FIELD", target = "Lnet/minecraft/client/option/GameOptions;gamma:F"))
	private float aloriahud$fullbright(GameOptions options) {
		return Visual.gamma(options.gamma);
	}

	@ModifyArg(method = "renderFog", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/platform/GlStateManager;fogStart(F)V"))
	private float aloriahud$fogStart(float start) {
		return Visual.linearFog(start, viewDistance);
	}

	@ModifyArg(method = "renderFog", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/platform/GlStateManager;fogEnd(F)V"))
	private float aloriahud$fogEnd(float end) {
		return Visual.linearFog(end, viewDistance);
	}

	@ModifyArg(method = "renderFog", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/platform/GlStateManager;fogDensity(F)V"))
	private float aloriahud$fogDensity(float density) {
		return Visual.densityFog(density, viewDistance);
	}
}
