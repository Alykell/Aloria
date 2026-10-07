package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.Visual;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
//#if MC >= 260000
import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#else
//$$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$$ import net.minecraft.client.player.LocalPlayer;
//$$ import net.minecraft.client.renderer.LightTexture;
//$$ import net.minecraft.core.Holder;
//$$ import net.minecraft.world.effect.MobEffect;
//$$ import net.minecraft.world.effect.MobEffects;
//$$ import net.minecraft.world.entity.LivingEntity;
//#endif

/** Luminosité max : l'éclairage est calculé comme avec l'effet Vision nocturne, sans avoir l'effet. */
//#if MC >= 260000
@Mixin(LightmapRenderStateExtractor.class)
public class LightmapMixin {
	@Inject(method = "extract", at = @At("TAIL"))
	private void aloriahud$fullbright(LightmapRenderState state, float partialTicks, CallbackInfo ci) {
		if (Visual.settings().fullbright) state.nightVisionEffectIntensity = 1f;
	}
}
//#else
//$$ @Mixin(LightTexture.class)
//$$ public class LightmapMixin {
//$$ 	/** Le calcul de la lumière demande « a-t-il Vision nocturne ? » : oui, si la luminosité max est activée */
//$$ 	@WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;hasEffect(Lnet/minecraft/core/Holder;)Z"))
//$$ 	private boolean aloriahud$fullbright(LocalPlayer player, Holder<MobEffect> effect, Operation<Boolean> original) {
//$$ 		return original.call(player, effect) || (effect == MobEffects.NIGHT_VISION && Visual.settings().fullbright);
//$$ 	}
//$$
//$$ 	/** Sans vrai effet, l'intensité est maximale (le jeu la lirait sur l'effet absent) */
//$$ 	@WrapOperation(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GameRenderer;getNightVisionScale(Lnet/minecraft/world/entity/LivingEntity;F)F"))
//$$ 	private float aloriahud$fullbrightScale(LivingEntity entity, float partialTicks, Operation<Float> original) {
//$$ 		return entity.hasEffect(MobEffects.NIGHT_VISION) ? original.call(entity, partialTicks) : 1f;
//$$ 	}
//$$ }
//#endif
