package com.playerium.music;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class PlaybackShuffleTest {
    @Test public void everyEntryOccursOnceAndTheCurrentOccurrenceStaysFirst(){
        Random random=new Random(7091);
        for(int size:new int[]{0,1,2,17,5000})for(int current:new int[]{-1,0,size/2,size-1}){
            int[] order=PlaybackShuffle.create(size,current,random);assertEquals(size,order.length);
            Set<Integer> seen=new HashSet<>();for(int index:order){assertTrue(index>=0&&index<size);assertTrue(seen.add(index));}
            if(current>=0&&current<size)assertEquals(current,order[0]);
        }
    }
    @Test public void repeatedEnablesProduceAllRemainingPermutationsWithoutFavouredPairs(){
        Random random=new Random(34077);int[][] positions=new int[4][4];Map<String,Integer> permutations=new HashMap<>();
        for(int attempt=0;attempt<24000;attempt++){
            int[] order=PlaybackShuffle.create(5,2,random);String key=Arrays.toString(order);permutations.put(key,permutations.getOrDefault(key,0)+1);
            int[] others={0,1,3,4};for(int slot=1;slot<5;slot++)for(int entry=0;entry<4;entry++)if(order[slot]==others[entry])positions[slot-1][entry]++;
        }
        assertEquals(24,permutations.size());
        for(int count:permutations.values())assertTrue("Uneven permutation distribution: "+count,count>800&&count<1200);
        for(int[] slot:positions)for(int count:slot)assertTrue("Favoured position: "+count,count>5600&&count<6400);
    }
    @Test public void subsequentShufflesDoNotReuseTheSavedOrder(){
        Random random=new Random(100);Set<String> orders=new HashSet<>();
        for(int i=0;i<100;i++)orders.add(Arrays.toString(PlaybackShuffle.create(20,9,random)));
        assertEquals(100,orders.size());
    }
}
