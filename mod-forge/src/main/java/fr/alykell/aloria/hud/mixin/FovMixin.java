package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.LegacyOptions;
import net.minecraft.client.entity.AbstractClientPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** FOV dynamique réglable (course, potion de vitesse, arc), comme « Effets de champ de vision » en 1.13+. */
@Mixin(AbstractClientPlayer.class)
public class FovMixin {
	@Inject(method = "getFovModifier", at = @At("RETURN"), cancellable = true)
	private void aloriahud$fovEffect(CallbackInfoReturnable<Float> cir) {
		float scale = LegacyOptions.fovEffectScale;
		if (scale < 1f) cir.setReturnValue(1f + (cir.getReturnValue() - 1f) * scale);
	}
}
