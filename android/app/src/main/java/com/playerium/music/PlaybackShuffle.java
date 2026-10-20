package com.playerium.music;

import java.util.Random;

/** Fresh unbiased order, keeping the active occurrence first without restarting it. */
final class PlaybackShuffle {
    static int[] create(int count,int current,Random random){
        if(count<0)throw new IllegalArgumentException("Negative queue size");
        int[] order=new int[count];boolean pinned=current>=0&&current<count;int offset=pinned?1:0;
        if(pinned)order[0]=current;
        int next=offset;
        for(int index=0;index<count;index++)if(!pinned||index!=current)order[next++]=index;
        for(int index=count-1;index>offset;index--){
            int swap=offset+random.nextInt(index-offset+1),entry=order[index];order[index]=order[swap];order[swap]=entry;
        }
        return order;
    }
}
