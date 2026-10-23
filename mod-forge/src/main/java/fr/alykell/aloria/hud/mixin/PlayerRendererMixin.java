package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.cosmetics.HatFeature;
import net.minecraft.client.entity.AbstractClientPlayer;
import net.minecraft.client.model.ModelBase;
import net.minecraft.client.renderer.entity.RenderManager;
import net.minecraft.client.renderer.entity.RenderPlayer;
import net.minecraft.client.renderer.entity.RendererLivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Ajoute le calque des chapeaux d'Aloria au rendu des joueurs (Mixin 0.7 : constructeur au RETURN seulement). */
@Mixin(RenderPlayer.class)
public abstract class PlayerRendererMixin extends RendererLivingEntity<AbstractClientPlayer> {
	private PlayerRendererMixin(RenderManager manager, ModelBase model, float shadow) {
		super(manager, model, shadow);
	}

	@Inject(method = "<init>(Lnet/minecraft/client/renderer/entity/RenderManager;Z)V", at = @At("RETURN"))
	private void aloriahud$hats(RenderManager manager, boolean slim, CallbackInfo ci) {
		this.addLayer(new HatFeature((RenderPlayer) (Object) this));
	}
}
