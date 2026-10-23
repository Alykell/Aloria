package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.cosmetics.Cosmetics;
import net.minecraft.client.entity.AbstractClientPlayer;
import net.minecraft.util.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Cape d'Aloria portée par le joueur (Cosmetics) à la place de celle du compte (ou d'OptiFine). */
@Mixin(AbstractClientPlayer.class)
public abstract class CapeMixin {
	@Inject(method = "getLocationCape", at = @At("RETURN"), cancellable = true)
	private void aloriahud$cape(CallbackInfoReturnable<ResourceLocation> cir) {
		String cape = Cosmetics.cape(((AbstractClientPlayer) (Object) this).getUniqueID());
		if (cape != null) cir.setReturnValue(Cosmetics.texture(cape));
	}
}
