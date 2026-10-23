package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.cosmetics.HatFeature;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.EntityRenderDispatcher;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Ajoute le calque des chapeaux d'Aloria au rendu des joueurs (la cape passe par CapeMixin). */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerRendererMixin extends LivingEntityRenderer<AbstractClientPlayerEntity> {
	private PlayerRendererMixin(EntityRenderDispatcher dispatcher, EntityModel model, float shadow) {
		super(dispatcher, model, shadow);
	}

	@Inject(method = "<init>(Lnet/minecraft/client/render/entity/EntityRenderDispatcher;Z)V", at = @At("RETURN"))
	private void aloriahud$hats(EntityRenderDispatcher dispatcher, boolean slim, CallbackInfo ci) {
		this.addFeature(new HatFeature((PlayerEntityRenderer) (Object) this));
	}
}
