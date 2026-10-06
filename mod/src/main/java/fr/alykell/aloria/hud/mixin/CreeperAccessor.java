package fr.alykell.aloria.hud.mixin;

import net.minecraft.world.entity.monster.Creeper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Gonflement du creeper : il explose quand swell atteint maxSwell (un cran par tick). */
@Mixin(Creeper.class)
public interface CreeperAccessor {
	@Accessor("swell")
	int getSwell();

	@Accessor("maxSwell")
	int getMaxSwell();
}
