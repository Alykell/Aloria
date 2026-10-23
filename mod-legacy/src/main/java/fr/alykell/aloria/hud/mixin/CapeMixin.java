package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.cosmetics.Cosmetics;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Cape d'Aloria portée par le joueur (Cosmetics) à la place de celle du compte (Yarn 1.8.9 : getSkinId = la cape). */
@Mixin(AbstractClientPlayerEntity.class)
public abstract class CapeMixin {
	@Inject(method = "getSkinId", at = @At("RETURN"), cancellable = true)
	private void aloriahud$cape(CallbackInfoReturnable<Identifier> cir) {
		String cape = Cosmetics.cape(((AbstractClientPlayerEntity) (Object) this).getUuid());
		if (cape != null) cir.setReturnValue(Cosmetics.texture(cape));
	}
}
