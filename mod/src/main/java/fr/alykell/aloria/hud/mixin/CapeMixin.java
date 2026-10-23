package fr.alykell.aloria.hud.mixin;

import fr.alykell.aloria.hud.AloriaHud;
import fr.alykell.aloria.hud.cosmetics.Cosmetics;
import net.minecraft.client.player.AbstractClientPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
//#if MC >= 12109
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;
//#elseif MC >= 12002
//$$ import net.minecraft.client.resources.PlayerSkin;
//#else
//$$ import net.minecraft.resources.ResourceLocation;
//#endif

/**
 * Cape d'Aloria portée par le joueur (Cosmetics) à la place de celle du compte. La texture suit le format des capes Mojang,
 * partie élytres comprise : les élytres prennent donc aussi ses couleurs.
 */
@Mixin(AbstractClientPlayer.class)
public abstract class CapeMixin {
	//#if MC >= 12002
	@Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
	private void aloriahud$cape(CallbackInfoReturnable<PlayerSkin> cir) {
		String cape = Cosmetics.cape(((AbstractClientPlayer) (Object) this).getUUID());
		if (cape == null) return;
		PlayerSkin skin = cir.getReturnValue();
		//#if MC >= 12109
		ClientAsset.ResourceTexture texture = new ClientAsset.ResourceTexture(Identifier.fromNamespaceAndPath(AloriaHud.MOD_ID, "cosmetics/" + cape));
		cir.setReturnValue(new PlayerSkin(skin.body(), texture, skin.elytra(), skin.model(), skin.secure()));
		//#else
		//$$ cir.setReturnValue(new PlayerSkin(skin.texture(), skin.textureUrl(), Cosmetics.texture(cape), skin.elytraTexture(), skin.model(), skin.secure()));
		//#endif
	}
	//#else
	//$$ @Inject(method = "getCloakTextureLocation", at = @At("RETURN"), cancellable = true)
	//$$ private void aloriahud$cape(CallbackInfoReturnable<ResourceLocation> cir) {
	//$$ 	String cape = Cosmetics.cape(((AbstractClientPlayer) (Object) this).getUUID());
	//$$ 	if (cape != null) cir.setReturnValue(Cosmetics.texture(cape));
	//$$ }
	//#endif
}
